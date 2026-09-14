/** Explicit static views share authored SSR markup with a renderer-free projector. */
import { builders as b, strongHash } from '@tsrx/core';
import { createLexicalAnalysis } from './compile-universal.js';
import { inheritHookMemoOrigin } from './inline-hook-memo.js';
import {
	ATTRIBUTE_ALIASES,
	BOOLEAN_ATTR_PROPS,
	MUST_USE_PROPERTY_PROPS,
	POSITIVE_NUMERIC_ATTR_PROPS,
	SVG_ONLY_TAGS,
	isUnitlessStyleProp,
	isEnumeratedBooleanAttr,
	hyphenateStyleName,
} from '../dom-tables.js';
import {
	invalidHtmlNestingWithAncestor,
	invalidHtmlNestingWithParent,
} from '../html-tree-validation.js';

export const DOM_BINDINGS_QUERY = 'octane-bindings';
const DIRECTIVE = 'use dom bindings';
const MARKER = 'data-octane-bindings';
const SKIP = new Set([
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
	'comments',
	'leadingComments',
	'trailingComments',
	'innerComments',
	'typeAnnotation',
	'typeParameters',
]);
const UNWRAP = new Set([
	'TSAsExpression',
	'TSTypeAssertion',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'ParenthesizedExpression',
]);
const FORBIDDEN_TAGS = new Set([
	'script',
	'style',
	'template',
	'noscript',
	'title',
	'desc',
	'meta',
	'link',
	'base',
	'html',
	'head',
	'body',
	'input',
	'textarea',
	'select',
	'option',
	'optgroup',
	'math',
	'foreignObject',
	'iframe',
	'object',
	'embed',
	'plaintext',
	'xmp',
]);
const FORBIDDEN_ATTRS = new Set([
	'ref',
	'key',
	'children',
	'dangerouslysetinnerhtml',
	'innerhtml',
	'innertext',
	'textcontent',
	'value',
	'checked',
	'defaultvalue',
	'defaultchecked',
	'autofocus',
	'suppresshydrationwarning',
	'suppressnativechangewarning',
	'is',
	'slot',
	'action',
	'formaction',
	'download',
	'capture',
	'rowspan',
	'start',
	MARKER,
]);
// These retain the normal SSR sanitizer when static or externally owned, but
// the small adoption writer deliberately has no URL/namespace semantics.
const URL_ATTRS = new Set([
	'src',
	'href',
	'xlink:href',
	'srcset',
	'imagesrcset',
	'poster',
	'cite',
	'background',
	'data',
	'ping',
	'archive',
	'codebase',
]);

function error(filename, node, message) {
	const error = new Error(
		`Octane DOM bindings (${filename}:${node?.loc?.start?.line ?? 1}): ${message}`,
	);
	error.code = 'OCTANE_DOM_BINDINGS';
	throw error;
}

export function domBindingExportFromId(id) {
	const question = id.indexOf('?');
	if (question === -1) return null;
	const values = new URLSearchParams(id.slice(question + 1).split('#')[0]).getAll(
		DOM_BINDINGS_QUERY,
	);
	if (values.length === 0) return null;
	if (values.length !== 1 || !/^[A-Za-z_$][\w$]*$/.test(values[0])) {
		error(id, null, `invalid ${DOM_BINDINGS_QUERY} export query`);
	}
	return values[0];
}

function walk(node, visit, parent = null, key = null) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit, parent, key);
		return;
	}
	if (visit(node, parent, key) === false) return;
	for (const [childKey, child] of Object.entries(node)) {
		if (!SKIP.has(childKey)) walk(child, visit, node, childKey);
	}
}

function mapCow(node, replacements) {
	if (!node || typeof node !== 'object') return node;
	if (replacements.has(node)) return replacements.get(node);
	if (Array.isArray(node)) {
		let result = null;
		for (let index = 0; index < node.length; index++) {
			const next = mapCow(node[index], replacements);
			if (result === null && next !== node[index]) result = node.slice(0, index);
			if (result !== null && next !== null) result.push(next);
		}
		return result ?? node;
	}
	let result = null;
	for (const [key, child] of Object.entries(node)) {
		if (SKIP.has(key)) continue;
		const next = mapCow(child, replacements);
		if (next !== child) {
			result ??= { ...node };
			result[key] = next;
		}
	}
	return result ?? node;
}

function unwrap(node) {
	while (UNWRAP.has(node?.type)) node = node.expression;
	return node;
}

function statements(fn) {
	return fn.body?.body ?? [];
}

function isDirective(node) {
	return node?.type === 'ExpressionStatement' && node.expression?.value === DIRECTIVE;
}

function attrName(attr) {
	const name = attr.name;
	return name?.type === 'JSXNamespacedName'
		? `${name.namespace.name}:${name.name.name}`
		: (name?.name ?? name);
}

function importedBindings(ast) {
	const imports = new Map();
	for (const declaration of ast.body) {
		if (declaration.type !== 'ImportDeclaration' || declaration.importKind === 'type') continue;
		for (const specifier of declaration.specifiers ?? []) {
			if (specifier.importKind === 'type') continue;
			imports.set(specifier.local.name, {
				declaration,
				specifier,
				source: declaration.source.value,
				imported: specifier.imported?.name ?? specifier.imported?.value ?? null,
			});
		}
	}
	return imports;
}

// The directive asserts imported projections are pure. Obvious writes, ambient
// reads, hooks and arbitrary calls remain diagnostics instead of silent one-shot work.
function assertProjection(expression, filename, imports, lexical, parameterScope) {
	walk(expression, (node, parent, key) => {
		if (node.type.startsWith('TS') && !UNWRAP.has(node.type)) return false;
		if (
			[
				'AssignmentExpression',
				'UpdateExpression',
				'AwaitExpression',
				'YieldExpression',
				'NewExpression',
				'TaggedTemplateExpression',
				'FunctionExpression',
				'ArrowFunctionExpression',
			].includes(node.type) ||
			(node.type === 'UnaryExpression' && node.operator === 'delete') ||
			/^JSX/.test(node.type)
		)
			error(filename, node, 'a binding value must be a pure props projection');
		if (isRuntimeReference(node, lexical, parent, key)) {
			const binding = lexical.resolveBinding(
				lexical.nodeScopes.get(node) ?? lexical.rootScope,
				node.name,
			);
			if (binding === null && !['undefined', 'NaN', 'Infinity'].includes(node.name)) {
				error(
					filename,
					node,
					`ambient value ${JSON.stringify(node.name)} is not a props projection`,
				);
			}
			if (binding?.scope === lexical.rootScope && !imports.has(node.name)) {
				error(filename, node, 'move module-local values into props or an imported pure projection');
			}
		}
		if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			const callee = unwrap(node.callee);
			const imported = callee?.type === 'Identifier' ? imports.get(callee.name) : null;
			const binding =
				callee &&
				lexical.resolveBinding(lexical.nodeScopes.get(callee) ?? parameterScope, callee.name);
			if (
				!imported ||
				binding?.scope !== lexical.rootScope ||
				/^use(?:[A-Z]|$)/.test(imported.imported ?? '') ||
				imported.source === 'octane' ||
				imported.source.startsWith('octane/')
			) {
				error(
					filename,
					node,
					'calls in bindings must be imported pure projections, not hooks or live accessors',
				);
			}
		}
	});
}

function planView(fn, filename, source, imports, lexical) {
	const body = statements(fn);
	if (!isDirective(body[0])) error(filename, fn, `place '${DIRECTIVE}' first in the view body`);
	const render =
		fn.body.type === 'JSXCodeBlock'
			? body.length === 1
				? fn.body.render
				: null
			: body.length === 2 && body[1].type === 'ReturnStatement'
				? unwrap(body[1].argument)
				: null;
	if (
		!render ||
		fn.async ||
		fn.generator ||
		fn.params.length !== 1 ||
		fn.params[0].type !== 'Identifier'
	) {
		error(
			filename,
			fn,
			'a binding view needs one props parameter and one static native root, without setup or early returns',
		);
	}
	const nodes = [];
	const bindings = [];
	const values = [];
	const parameterScope = lexical.nodeScopes.get(fn.body) ?? lexical.rootScope;
	const unbound = new Map();
	const add = (node, kind, name, value, origin, unitless) => {
		assertProjection(value, filename, imports, lexical, parameterScope);
		// Static authored markup is not a behavior-owned channel. In particular,
		// SVG paths remain in SSR rather than shipping again in every projector.
		if (unwrap(value)?.type === 'Literal') return;
		bindings.push([node, kind, name, ...(unitless === undefined ? [] : [unitless])]);
		values.push(value);
	};
	const visit = (element, parent, namespace, ancestors) => {
		if (element?.type !== 'JSXElement' && element?.type !== 'Element') {
			error(
				filename,
				element,
				'binding views support fixed native elements only, without text or structural holes',
			);
		}
		const tag = element.openingElement?.name?.name ?? element.id?.name;
		if (typeof tag !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(tag) || FORBIDDEN_TAGS.has(tag)) {
			error(
				filename,
				element,
				'component, custom, parser-sensitive and resource elements are not supported in binding views',
			);
		}
		if (namespace === 0 && tag !== 'svg' && SVG_ONLY_TAGS.has(tag))
			error(filename, element, 'SVG binding descendants need an explicit svg root');
		const ns = tag === 'svg' ? 1 : namespace;
		if (ns === 1 && tag !== 'svg' && tag !== 'a' && !SVG_ONLY_TAGS.has(tag))
			error(filename, element, 'SVG binding descendants must be native SVG elements');
		if (ns === 0 && ancestors.length > 0) {
			const direct = invalidHtmlNestingWithParent(tag, ancestors.at(-1));
			if (direct) error(filename, element, direct);
			for (let i = 0; i < ancestors.length; i++) {
				const invalid = invalidHtmlNestingWithAncestor(tag, ancestors.slice(i).reverse());
				if (invalid) error(filename, element, invalid);
			}
		}
		const children = (element.children ?? []).filter(
			(child) =>
				child.type !== 'JSXText' || child.value.trim() !== '' || !/[\r\n]/.test(child.value),
		);
		const index = nodes.length;
		nodes.push([parent, tag, ns, children.length]);
		const owned = new Set();
		for (const attr of element.openingElement?.attributes ?? element.attributes ?? []) {
			if (attr.type !== 'JSXAttribute' && attr.type !== 'Attribute')
				error(filename, attr, 'spread attributes are not supported in binding views');
			const raw = attrName(attr);
			let name = raw === 'className' ? 'class' : (ATTRIBUTE_ALIASES.get(raw) ?? raw);
			if (ns === 0) name = name.toLowerCase();
			const lower = name.toLowerCase();
			if (
				!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name) ||
				lower.startsWith('on') ||
				FORBIDDEN_ATTRS.has(lower) ||
				MUST_USE_PROPERTY_PROPS.has(lower) ||
				POSITIVE_NUMERIC_ATTR_PROPS.has(lower)
			) {
				error(filename, attr, `attribute ${JSON.stringify(raw)} is not supported in binding views`);
			}
			if (owned.has(name))
				error(filename, attr, `duplicate binding attribute ${JSON.stringify(name)}`);
			owned.add(name);
			const value =
				attr.value === null
					? b.literal(true)
					: unwrap(
							attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value,
						);
			const external =
				value?.type === 'CallExpression' && value.callee.type === 'Identifier'
					? imports.get(value.callee.name)
					: null;
			if (
				external?.source === 'octane/behavior' &&
				external.imported === 'unbound' &&
				lexical.resolveBinding(lexical.nodeScopes.get(value.callee), value.callee.name)?.scope ===
					lexical.rootScope
			) {
				if (
					value.arguments.length !== 1 ||
					value.arguments[0].type === 'SpreadElement' ||
					value.optional
				)
					error(filename, value, 'unbound requires one external-owned attribute value');
				assertProjection(value.arguments[0], filename, imports, lexical, parameterScope);
				unbound.set(value, value.arguments[0]);
				continue;
			}
			if (URL_ATTRS.has(lower) || name.includes(':')) {
				if (value?.type === 'Literal') continue;
				error(filename, attr, 'URL and namespaced attributes must be static or explicitly unbound');
			}
			if (name === 'style') {
				if (value?.type !== 'ObjectExpression')
					error(filename, attr, 'binding styles need an object with fixed property keys');
				const properties = new Set();
				for (const property of value.properties) {
					if (
						property.type !== 'Property' ||
						property.kind !== 'init' ||
						property.computed ||
						property.method
					)
						error(filename, property, 'binding styles need fixed ordinary properties');
					const key = property.key.name ?? property.key.value;
					if (typeof key !== 'string')
						error(filename, property, 'binding style property names must be strings');
					const cssName = hyphenateStyleName(key);
					if (!/^(?:--[A-Za-z_][\w-]*|-?[a-z][a-z-]*)$/.test(cssName))
						error(filename, property, 'invalid fixed binding style property');
					if (properties.has(cssName))
						error(filename, property, `duplicate style property ${JSON.stringify(cssName)}`);
					properties.add(cssName);
					add(
						index,
						'styleProperty',
						cssName,
						property.value,
						property,
						cssName.startsWith('--') || isUnitlessStyleProp(key),
					);
				}
			} else {
				const kind =
					name === 'class'
						? 'class'
						: name.startsWith('aria-') || name.startsWith('data-') || isEnumeratedBooleanAttr(lower)
							? 'aria'
							: BOOLEAN_ATTR_PROPS.has(lower)
								? 'boolean'
								: 'attr';
				add(index, kind, name, value, attr);
			}
		}
		for (const child of children) visit(child, index, ns, [...ancestors, tag]);
	};
	visit(render, -1, 0, []);
	return {
		fn,
		render,
		nodes,
		bindings,
		values,
		unbound,
		id: `d:${strongHash(`octane:dom-bindings:1\0${filename}\0${fn.id.name}\0${source}`)}`,
	};
}

function literalData(value) {
	return Array.isArray(value) ? b.array(value.map(literalData)) : b.literal(value);
}

function projectProgram(ast, plan, filename, lexical) {
	for (const statement of ast.body) {
		const declaration = statement.declaration ?? statement;
		if (
			statement.type === 'ImportDeclaration' ||
			statement.exportKind === 'type' ||
			declaration.type === 'TSInterfaceDeclaration' ||
			declaration.type === 'TSTypeAliasDeclaration' ||
			declaration.declare === true ||
			declaration.type === 'FunctionDeclaration'
		)
			continue;
		if (statement.type === 'ExpressionStatement' && typeof statement.directive === 'string')
			continue;
		error(
			filename,
			statement,
			'binding view modules cannot contain eager module initialization; pass state as props',
		);
	}
	const project = inheritHookMemoOrigin(b.arrow(plan.fn.params, b.array(plan.values)), plan.fn);
	const needed = new Set();
	walk(plan.values, (node, parent, key) => {
		if (node.type.startsWith('TS') && !UNWRAP.has(node.type)) return false;
		if (
			isRuntimeReference(node, lexical, parent, key) &&
			lexical.resolveBinding(lexical.nodeScopes.get(node) ?? lexical.rootScope, node.name)
				?.importSource != null
		) {
			needed.add(node.name);
		}
	});
	const importNodes = ast.body.flatMap((node) => {
		if (node.type !== 'ImportDeclaration' || node.importKind === 'type') return [];
		if (node.specifiers.length === 0) return [node];
		const specifiers = node.specifiers.filter(
			(specifier) => specifier.importKind !== 'type' && needed.has(specifier.local.name),
		);
		return specifiers.length === 0 ? [] : [{ ...node, specifiers }];
	});
	return {
		...ast,
		body: [
			...importNodes,
			inheritHookMemoOrigin(
				b.export_default(
					b.object([
						b.prop('init', b.id('id'), b.literal(plan.id)),
						b.prop('init', b.id('nodes'), literalData(plan.nodes)),
						b.prop('init', b.id('bindings'), literalData(plan.bindings)),
						b.prop('init', b.id('project'), project),
					]),
				),
				plan.fn,
			),
		],
	};
}

function isRuntimeReference(node, lexical, parent, key) {
	if (node.type === 'JSXIdentifier')
		return (
			(parent?.type === 'JSXOpeningElement' || parent?.type === 'JSXClosingElement') &&
			key === 'name'
		);
	if (
		node.type !== 'Identifier' ||
		lexical.bindingNodes.has(node) ||
		lexical.nonReferenceNodes.has(node)
	)
		return false;
	if (parent?.type?.startsWith('Import')) return false;
	if (parent?.type === 'ExportSpecifier' && key === 'exported') return false;
	if (
		(parent?.type === 'MemberExpression' || parent?.type === 'OptionalMemberExpression') &&
		key === 'property' &&
		!parent.computed
	)
		return false;
	if (parent?.type === 'Property' && key === 'key' && !parent.computed) return false;
	return true;
}

/** Lower only statically proven imported calls; authored types keep the real view import. */
function lowerAdoptions(ast, filename) {
	const imports = importedBindings(ast);
	const intrinsics = new Set(
		[...imports]
			.filter(
				([, value]) => value.source === 'octane/behavior' && value.imported === 'adoptBindings',
			)
			.map(([name]) => name),
	);
	if (intrinsics.size === 0) return ast;
	const lexical = createLexicalAnalysis(ast);
	const replacements = new Map();
	const consumed = new Set();
	const added = [];
	const names = new Set();
	walk(ast, (node) => {
		if (node.type === 'Identifier') names.add(node.name);
	});
	const allocate = (prefix) => {
		let name = prefix;
		for (let index = 1; names.has(name); index++) name = `${prefix}${index}`;
		names.add(name);
		return name;
	};
	let helper = null;
	const queryLocals = new Map();
	walk(ast, (node) => {
		if (
			node.type !== 'CallExpression' ||
			node.callee?.type !== 'Identifier' ||
			!intrinsics.has(node.callee.name)
		)
			return;
		if (
			lexical.resolveBinding(lexical.nodeScopes.get(node.callee), node.callee.name)?.scope !==
			lexical.rootScope
		)
			return;
		const view = unwrap(node.arguments[1]);
		const imported = view?.type === 'Identifier' ? imports.get(view.name) : null;
		if (
			node.optional ||
			node.arguments.length < 3 ||
			node.arguments.length > 4 ||
			node.arguments.some((arg) => arg.type === 'SpreadElement') ||
			!imported?.imported ||
			imported.specifier.type !== 'ImportSpecifier' ||
			lexical.resolveBinding(lexical.nodeScopes.get(view), view.name)?.scope !==
				lexical.rootScope ||
			/[?#]/.test(imported.source)
		) {
			error(
				filename,
				node,
				'adoptBindings requires a directly imported named view and explicit root, source and options arguments',
			);
		}
		if (helper === null) {
			helper = allocate('_$adoptBindings');
			added.push(
				inheritHookMemoOrigin(
					b.imports([['__adoptBindings', helper]], 'octane/dom-bindings'),
					node,
				),
			);
		}
		const request = `${imported.source}?${DOM_BINDINGS_QUERY}=${encodeURIComponent(imported.imported)}`;
		let local = queryLocals.get(request);
		if (local === undefined) {
			local = allocate('_$bindingView');
			queryLocals.set(request, local);
			added.push(inheritHookMemoOrigin(b.imports([['default', local]], request), node));
		}
		consumed.add(node.callee);
		consumed.add(view);
		// Replace leaves so nested adoptions in source/options remain traversable.
		replacements.set(node.callee, inheritHookMemoOrigin(b.id(helper), node.callee));
		replacements.set(view, inheritHookMemoOrigin(b.id(local), view));
	});
	const remaining = new Set();
	walk(ast, (node, parent, key) => {
		if (node.type.startsWith('TS') && !UNWRAP.has(node.type)) return false;
		if (
			isRuntimeReference(node, lexical, parent, key) &&
			!consumed.has(node) &&
			lexical.resolveBinding(lexical.nodeScopes.get(node), node.name)?.scope === lexical.rootScope
		)
			remaining.add(node.name);
	});
	for (const name of intrinsics) {
		if (remaining.has(name))
			error(
				filename,
				imports.get(name).specifier,
				'adoptBindings must be called directly in a compiler-owned .tsrx/.tsx module',
			);
	}
	const candidates = new Set([...consumed].map((node) => node.name));
	for (const node of ast.body) {
		if (node.type !== 'ImportDeclaration') continue;
		const specifiers = node.specifiers.filter(
			(specifier) => !candidates.has(specifier.local.name) || remaining.has(specifier.local.name),
		);
		if (specifiers.length !== node.specifiers.length)
			replacements.set(node, specifiers.length === 0 ? null : { ...node, specifiers });
	}
	const lowered = mapCow(ast, replacements);
	return { ...lowered, body: [...added, ...lowered.body] };
}

/** Annotate normal SSR/client output, or select a pure adoption descriptor Program. */
export function prepareDomBindings(ast, source, filename, selectedExport) {
	const imports = importedBindings(ast);
	const lexical = createLexicalAnalysis(ast);
	const plans = new Map();
	const replacements = new Map();
	walk(ast, (node, parent) => {
		if (
			!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
		)
			return;
		if (!statements(node).some(isDirective)) return;
		if (
			node.type !== 'FunctionDeclaration' ||
			parent?.type !== 'ExportNamedDeclaration' ||
			!ast.body.includes(parent) ||
			!node.id
		) {
			error(filename, node, 'binding views must be named top-level exported functions');
		}
		const plan = planView(node, filename, source, imports, lexical);
		plans.set(node.id.name, plan);
		for (const [call, value] of plan.unbound) replacements.set(call, value);
		const marker = inheritHookMemoOrigin(
			b.jsx_attribute(b.jsx_id(MARKER), b.literal(plan.id)),
			plan.render,
		);
		const root = mapCow(plan.render, plan.unbound);
		if (plan.render.openingElement) {
			replacements.set(plan.render, {
				...root,
				openingElement: {
					...root.openingElement,
					attributes: [...root.openingElement.attributes, marker],
				},
			});
		} else {
			replacements.set(plan.render, { ...root, attributes: [...root.attributes, marker] });
		}
	});
	if (selectedExport !== null) {
		const plan = plans.get(selectedExport);
		if (!plan)
			error(
				filename,
				ast,
				`export ${JSON.stringify(selectedExport)} is not an opted-in static binding view`,
			);
		return projectProgram(ast, plan, filename, lexical);
	}
	return lowerAdoptions(mapCow(ast, replacements), filename);
}
