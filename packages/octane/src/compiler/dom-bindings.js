/** Explicit presentation views share authored SSR markup with a renderer-free program. */
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
import { shouldSanitizeURLAttribute } from '../sanitize-url.js';
import { needsBindingProgram, planBindingProgram } from './dom-binding-program.js';

export const DOM_BINDINGS_QUERY = 'octane-bindings';
export const DOM_BINDINGS_MOUNT_QUERY = 'octane-mount';
export const DOM_BINDING_COMPILER_ABI_VERSION = 1;
const DIRECTIVE = 'use dom bindings';
const MARKER = 'data-octane-bindings';
const NODE_MARKER = 'data-octane-binding-node';
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
	'head',
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
	'suppresshydrationwarning',
	'suppressnativechangewarning',
	'is',
	'slot',
	'download',
	'capture',
	'rowspan',
	'start',
	MARKER,
	NODE_MARKER,
]);
// Initial form state and submission identity stay with normal SSR/native owners.
// A presentation binding must not reset a user's edit or change its form owner.
const EXTERNAL_ATTRS = new Set([
	'autofocus',
	'value',
	'checked',
	'defaultvalue',
	'defaultchecked',
	'selected',
	'action',
	'formaction',
	'formmethod',
	'formenctype',
	'formtarget',
]);
const FORM_HOSTS = new Set(['input', 'textarea', 'select', 'button', 'option', 'optgroup', 'form']);

function externalAttribute(tag, name) {
	return (
		(EXTERNAL_ATTRS.has(name) && !(tag === 'button' && name === 'value')) ||
		(MUST_USE_PROPERTY_PROPS.has(name) && !(tag === 'button' && name === 'value')) ||
		POSITIVE_NUMERIC_ATTR_PROPS.has(name) ||
		(FORM_HOSTS.has(tag) &&
			(name === 'name' ||
				name === 'id' ||
				name === 'form' ||
				name === 'multiple' ||
				(tag === 'input' && (name === 'type' || name === 'list')) ||
				(tag === 'form' && ['id', 'method', 'enctype', 'target', 'accept-charset'].includes(name))))
	);
}

function bindingKind(tag, name) {
	return name === 'class'
		? 'class'
		: name === 'style'
			? 'styleAttribute'
			: shouldSanitizeURLAttribute(tag, name)
				? 'url'
				: name.startsWith('aria-') ||
					  name.startsWith('data-') ||
					  isEnumeratedBooleanAttr(name.toLowerCase())
					? 'aria'
					: BOOLEAN_ATTR_PROPS.has(name.toLowerCase())
						? 'boolean'
						: 'attr';
}
// URL sinks with an existing native sanitizer can be projected. Other URL
// shapes remain static or externally owned rather than inventing a policy.
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
	const query = new URLSearchParams(id.slice(question + 1).split('#')[0]);
	const values = query.getAll(DOM_BINDINGS_QUERY);
	const mounting = query.getAll(DOM_BINDINGS_MOUNT_QUERY);
	if (
		mounting.length > 1 ||
		(mounting.length === 1 && (mounting[0] !== '1' || values.length !== 1))
	)
		error(id, null, 'octane-mount=1 requires one selected binding export');
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
	if (typeof node.type !== 'string') return;
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

function attrValueForBinding(attr) {
	return attr.value === null
		? b.literal(true)
		: unwrap(attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value);
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
function assertProjection(
	expression,
	filename,
	imports,
	lexical,
	parameterScope,
	constants = new Set(),
) {
	// Like imported projections, these native reads rely on the directive's
	// immutable-props contract. A string result cast does not admit arbitrary
	// methods: every call in a chain must independently satisfy this boundary.
	const readReceiver = (input, sampled = false) => {
		let receiver = unwrap(input);
		if (receiver?.type === 'ChainExpression') return readReceiver(receiver.expression, sampled);
		if (receiver?.type === 'LogicalExpression')
			return readReceiver(receiver.left) && readReceiver(receiver.right);
		if (receiver?.type === 'ConditionalExpression')
			return readReceiver(receiver.consequent) && readReceiver(receiver.alternate);
		if (receiver?.type === 'Literal') return typeof receiver.value === 'string';
		if (['CallExpression', 'OptionalCallExpression'].includes(receiver?.type))
			return readMethod(receiver);
		while (['MemberExpression', 'OptionalMemberExpression'].includes(receiver?.type))
			receiver = unwrap(receiver.object);
		if (receiver?.type !== 'Identifier') return false;
		const binding = lexical.resolveBinding(
			lexical.nodeScopes.get(receiver) ?? parameterScope,
			receiver.name,
		);
		return (
			binding != null &&
			(binding.scope !== lexical.rootScope || (sampled && imports.has(receiver.name)))
		);
	};
	const readMethod = (node) => {
		const callee = unwrap(node?.callee);
		const sampled =
			(node?.type === 'CallExpression' || node?.type === 'OptionalCallExpression') &&
			node.arguments.length === 0 &&
			(callee?.computed ? callee.property?.value === 'get' : callee?.property?.name === 'get');
		if (
			!['MemberExpression', 'OptionalMemberExpression'].includes(callee?.type) ||
			(!sampled &&
				(callee.computed ||
					!['includes', 'find', 'trim', 'slice', 'toUpperCase'].includes(callee.property.name)))
		)
			return false;
		return readReceiver(callee.object, sampled);
	};
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
			].includes(node.type) ||
			(['FunctionExpression', 'ArrowFunctionExpression'].includes(node.type) &&
				!(
					key === 'arguments' &&
					readMethod(parent) &&
					['includes', 'find'].includes(unwrap(parent.callee)?.property?.name) &&
					node.body.type !== 'BlockStatement' &&
					!node.async &&
					node.params.every((param) => param.type === 'Identifier')
				)) ||
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
				const declaration = lexical.domBindingConstants?.get(node.name);
				if (!declaration)
					error(
						filename,
						node,
						'move module-local values into props or an imported pure projection',
					);
				if (constants.has(node.name))
					error(filename, node, 'cyclic binding constants are not supported');
				assertProjection(
					declaration.init,
					filename,
					imports,
					lexical,
					parameterScope,
					new Set([...constants, node.name]),
				);
			}
		}
		if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			const callee = unwrap(node.callee);
			if (readMethod(node)) return;
			let importedRoot = callee;
			while (importedRoot?.type === 'MemberExpression' && !importedRoot.computed)
				importedRoot = importedRoot.object;
			const namespace =
				importedRoot !== callee &&
				importedRoot?.type === 'Identifier' &&
				imports.get(importedRoot.name)?.specifier.type === 'ImportNamespaceSpecifier'
					? importedRoot
					: null;
			const reference = namespace ?? callee;
			const imported = reference?.type === 'Identifier' ? imports.get(reference.name) : null;
			const binding =
				callee &&
				lexical.resolveBinding(lexical.nodeScopes.get(reference) ?? parameterScope, reference.name);
			if (
				!imported ||
				binding?.scope !== lexical.rootScope ||
				/^use(?:[A-Z]|$)/.test(namespace ? callee.property.name : (imported.imported ?? '')) ||
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

function bindingRender(fn, filename, required = true) {
	const body = statements(fn);
	const offset = isDirective(body[0]) ? 1 : 0;
	if (required && offset === 0) error(filename, fn, `place '${DIRECTIVE}' first in the view body`);
	const render =
		fn.body.type === 'JSXCodeBlock'
			? fn.body.render
			: body.at(-1)?.type === 'ReturnStatement'
				? unwrap(body.at(-1).argument)
				: null;
	const setup = body.slice(offset, fn.body.type === 'JSXCodeBlock' ? undefined : -1);
	if (
		!setup.every(
			(statement) =>
				statement.type === 'VariableDeclaration' &&
				statement.kind === 'const' &&
				statement.declarations.every((decl) => decl.id.type === 'Identifier' && decl.init),
		)
	)
		error(filename, fn, 'binding setup supports only pure const aliases before its output');
	if (
		!render ||
		fn.async ||
		fn.generator ||
		fn.params.length > 1 ||
		(required && fn.params.length !== 1) ||
		(fn.params.length === 1 && fn.params[0].type !== 'Identifier')
	) {
		error(
			filename,
			fn,
			'a binding view needs an ordinary props parameter and one template output, without early returns',
		);
	}
	return render;
}

function planView(fn, filename, source, imports, lexical, native = null) {
	const render = native?.element ?? bindingRender(fn, filename);
	const nodes = [];
	const elements = [];
	const bindings = [];
	const values = [];
	const projections = [];
	const signalIndices = [];
	const styleIndices = [];
	const classAttributes = new Map();
	const id = `d:${strongHash(`octane:dom-bindings:2\0${filename}\0${fn.id.name}\0${source}`)}`;
	const parameterScope = lexical.nodeScopes.get(fn.body) ?? lexical.rootScope;
	const unbound = new Map();
	let addressed = false;
	const markUnbound = (expression, opaque = false) => {
		const value = unwrap(expression);
		const external =
			value?.type === 'CallExpression' && value.callee.type === 'Identifier'
				? imports.get(value.callee.name)
				: null;
		if (
			external?.source !== 'octane/behavior' ||
			external.imported !== 'unbound' ||
			lexical.resolveBinding(lexical.nodeScopes.get(value.callee), value.callee.name)?.scope !==
				lexical.rootScope
		)
			return false;
		if (
			value.arguments.length !== 1 ||
			value.arguments[0].type === 'SpreadElement' ||
			value.optional
		)
			error(filename, value, 'unbound requires one externally owned value');
		// Opaque descendants remain ordinary authored output. Their expressions
		// never execute in the selected artifact, so they need no projection proof.
		if (!opaque) assertProjection(value.arguments[0], filename, imports, lexical, parameterScope);
		unbound.set(value, value.arguments[0]);
		return true;
	};
	const add = (node, kind, name, value, origin, unitless) => {
		assertProjection(value, filename, imports, lexical, parameterScope);
		// Static authored markup is not a behavior-owned channel. In particular,
		// SVG paths remain in SSR rather than shipping again in every projector.
		if (unwrap(value)?.type === 'Literal') return;
		if (kind === 'styleObject') styleIndices.push(bindings.length);
		else if (kind !== 'classToken' && kind !== 'control' && lexical.domBindingCanCarrySignal(value))
			signalIndices.push(bindings.length);
		bindings.push([node, kind, name, ...(unitless === undefined ? [] : [unitless])]);
		values.push(value);
	};
	const addClassTokens = (index, expression) => {
		const tokens = new Set();
		const reserved = new Set();
		const externalTokens = new Set();
		const collectStaticTokens = (input) => {
			const value = unwrap(input);
			if (value?.type === 'Literal') {
				if (typeof value.value === 'string' || typeof value.value === 'number') {
					for (const token of String(value.value || '').split(/[\t\n\f\r ]+/))
						externalTokens.add(token);
				}
			} else if (value?.type === 'ArrayExpression') {
				for (const child of value.elements) collectStaticTokens(child);
			} else if (value?.type === 'ObjectExpression') {
				for (const property of value.properties) {
					if (
						property.type !== 'Property' ||
						property.kind !== 'init' ||
						property.computed ||
						property.method
					)
						continue;
					const key = property.key.name ?? property.key.value;
					const condition = unwrap(property.value);
					if (typeof key === 'string' && condition?.type === 'Literal' && condition.value) {
						for (const token of key.split(/[\t\n\f\r ]+/)) externalTokens.add(token);
					}
				}
			}
		};
		const visitClass = (input) => {
			const value = unwrap(input);
			if (markUnbound(value)) {
				collectStaticTokens(value.arguments[0]);
				return;
			}
			if (value?.type === 'ArrayExpression') {
				for (const child of value.elements) {
					if (child !== null) visitClass(child);
				}
				return;
			}
			if (value?.type === 'Literal') {
				collectStaticTokens(value);
				return;
			}
			if (value?.type !== 'ObjectExpression')
				error(
					filename,
					value,
					'partial classes need fixed token objects and explicitly unbound values',
				);
			for (const property of value.properties) {
				if (
					property.type !== 'Property' ||
					property.kind !== 'init' ||
					property.computed ||
					property.method
				)
					error(filename, property, 'partial classes need fixed ordinary token properties');
				const token = property.key.name ?? property.key.value;
				if (
					typeof token !== 'string' ||
					token === '' ||
					/[\t\n\f\r ]/.test(token) ||
					token === '__proto__'
				)
					error(filename, property, 'a class binding key must be one fixed nonempty class token');
				if (tokens.has(token))
					error(filename, property, `duplicate class token ${JSON.stringify(token)}`);
				tokens.add(token);
				if (unwrap(property.value)?.type !== 'Literal') reserved.add(token);
				add(index, 'classToken', token, property.value, property);
			}
		};
		visitClass(expression);
		for (const token of reserved) {
			if (externalTokens.has(token))
				error(
					filename,
					expression,
					`unbound classes must not contribute owned token ${JSON.stringify(token)}`,
				);
		}
	};
	const hasPartialClass = (input) => {
		const value = unwrap(input);
		return (
			value?.type === 'ObjectExpression' ||
			markUnbound(value) ||
			(value?.type === 'ArrayExpression' && value.elements.some(hasPartialClass))
		);
	};
	const addClassGroups = (index, attr, input) => {
		const baseline = [];
		const groups = [];
		let needsGroup = false;
		const collect = (expression) => {
			const value = unwrap(expression);
			if (markUnbound(value)) baseline.push(value.arguments[0]);
			else if (value?.type === 'Literal') baseline.push(value);
			else if (value?.type === 'ArrayExpression') {
				for (const child of value.elements) if (child !== null) collect(child);
			} else {
				groups.push(value);
				needsGroup ||=
					value?.type !== 'ObjectExpression' ||
					value.properties.some((property) => property.type !== 'Property' || property.computed);
			}
		};
		collect(input);
		if (!needsGroup) return false;
		const receipt = `data-octane-class-${id}-${index}`;
		const value = b.array(groups);
		assertProjection(value, filename, imports, lexical, parameterScope);
		bindings.push([index, 'classGroup', receipt, 0]);
		values.push(value);
		classAttributes.set(attr, {
			...attr,
			_octaneBindingClassGroups: { receipt, baseline, groups: [value] },
		});
		return true;
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
		const authoredChildren = (native === null ? (element.children ?? []) : []).filter(
			(child) =>
				(child.type !== 'JSXText' || child.value.trim() !== '' || !/[\r\n]/.test(child.value)) &&
				(child.type !== 'JSXExpressionContainer' ||
					child.expression?.type !== 'JSXEmptyExpression'),
		);
		const children = authoredChildren.filter((child) => {
			const expression = child.type === 'JSXExpressionContainer' ? child.expression : null;
			return expression === null || !markUnbound(expression, true);
		});
		const opaqueChildren = authoredChildren.length !== children.length;
		const openChildren = tag !== 'textarea' && opaqueChildren && children.length > 0;
		if (tag === 'textarea' && children.some((child) => child.type !== 'JSXText'))
			error(filename, element, 'textarea content must be static text or explicitly unbound');
		if (openChildren) addressed = true;
		const index = nodes.length;
		// Textarea's initial value is serialized as text by the normal SSR path.
		// Its children belong to the native control, even without an authored hole.
		nodes.push([
			parent,
			tag,
			ns,
			(opaqueChildren && !openChildren) || tag === 'textarea' ? null : children.length,
			...(openChildren ? [true] : []),
		]);
		elements.push(element);
		const owned = new Set();
		const externalNames = new Set();
		const knownFields = new Set();
		for (const attr of element.openingElement?.attributes ?? element.attributes ?? []) {
			if (attr.type === 'JSXSpreadAttribute' || attr.type === 'SpreadAttribute') {
				if (attr._octaneKnownAttributeSpread) {
					assertProjection(attr.argument, filename, imports, lexical, parameterScope);
					const temporary = b.id(lexical.domBindingAllocateName('_bindingAttrs'));
					projections.push(inheritHookMemoOrigin(b.const(temporary, attr.argument), attr));
					for (const raw of attr._octaneKnownAttributeSpread.fields) {
						let name = raw === 'className' ? 'class' : (ATTRIBUTE_ALIASES.get(raw) ?? raw);
						if (ns === 0) name = name.toLowerCase();
						const lower = name.toLowerCase();
						if (
							FORBIDDEN_ATTRS.has(lower) ||
							lower.startsWith('on') ||
							lower.startsWith('data-octane-class-') ||
							externalAttribute(tag, lower) ||
							((URL_ATTRS.has(lower) || name.includes(':')) &&
								!shouldSanitizeURLAttribute(tag, name))
						)
							error(
								filename,
								attr,
								`known spread field ${JSON.stringify(raw)} is not a presentation channel`,
							);
						if (owned.has(name) || externalNames.has(lower))
							error(filename, attr, `known spread conflicts with attribute ${JSON.stringify(raw)}`);
						owned.add(name);
						knownFields.add(lower);
						signalIndices.push(bindings.length);
						bindings.push([index, bindingKind(tag, name), name]);
						values.push(
							inheritHookMemoOrigin(
								b.conditional(
									b.binary('==', temporary, b.literal(null)),
									b.unary('void', b.literal(0)),
									b.member(temporary, b.literal(raw), true),
								),
								attr,
							),
						);
					}
					continue;
				}
				if (!markUnbound(attr.argument))
					error(filename, attr, 'binding attribute spreads must be explicitly unbound');
				if (bindings.some((binding) => binding[0] === index))
					error(filename, attr, 'unbound attribute spreads must precede owned binding attributes');
				const external = unwrap(unwrap(attr.argument).arguments[0]);
				if (external?.type === 'ObjectExpression') {
					for (const property of external.properties) {
						if (property.type !== 'Property' || property.computed) continue;
						const raw = property.key.name ?? property.key.value;
						if (typeof raw !== 'string') continue;
						const name = (
							raw === 'className' ? 'class' : (ATTRIBUTE_ALIASES.get(raw) ?? raw)
						).toLowerCase();
						if (
							FORBIDDEN_ATTRS.has(name) ||
							name.startsWith('on') ||
							name.startsWith('data-octane-class-')
						)
							error(
								filename,
								property,
								`unbound spreads cannot supply reserved or structural attribute ${JSON.stringify(raw)}`,
							);
						externalNames.add(name);
					}
				}
				continue;
			}
			if (attr.type !== 'JSXAttribute' && attr.type !== 'Attribute')
				error(filename, attr, 'spread attributes are not supported in binding views');
			const raw = attrName(attr);
			let name = raw === 'className' ? 'class' : (ATTRIBUTE_ALIASES.get(raw) ?? raw);
			if (ns === 0) name = name.toLowerCase();
			const lower = name.toLowerCase();
			if (owned.has(name))
				error(
					filename,
					attr,
					`${knownFields.has(lower) ? 'known spread conflicts with' : 'duplicate binding'} attribute ${JSON.stringify(name)}`,
				);
			owned.add(name);
			if (lower === 'dangerouslysetinnerhtml' && markUnbound(attrValueForBinding(attr), true)) {
				if (authoredChildren.length > 0)
					error(filename, attr, 'an opaque HTML host cannot also declare binding children');
				nodes[index][3] = null;
				continue;
			}
			if (
				!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name) ||
				lower.startsWith('on') ||
				FORBIDDEN_ATTRS.has(lower) ||
				lower.startsWith('data-octane-class-')
			) {
				error(filename, attr, `attribute ${JSON.stringify(raw)} is not supported in binding views`);
			}
			const value =
				attr.value === null
					? b.literal(true)
					: unwrap(
							attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value,
						);
			if (markUnbound(value)) continue;
			if (value?.type !== 'Literal' && externalNames.has(lower))
				error(
					filename,
					attr,
					`unbound spreads must not contribute owned attribute ${JSON.stringify(raw)}`,
				);
			if (externalAttribute(tag, lower)) {
				if (value?.type === 'Literal') continue;
				if (
					(lower === 'value' && ['input', 'textarea', 'select'].includes(tag)) ||
					(lower === 'checked' && tag === 'input')
				) {
					if (lower === 'checked') {
						const type = (element.openingElement?.attributes ?? element.attributes ?? []).find(
							(attribute) => attrName(attribute) === 'type',
						);
						const inputType = type && unwrap(attrValueForBinding(type));
						if (inputType?.type !== 'Literal' || !['checkbox', 'radio'].includes(inputType.value))
							error(
								filename,
								attr,
								'a checked binding requires a fixed checkbox or radio input type',
							);
					}
					add(index, 'control', lower, value, attr);
					continue;
				}
				error(
					filename,
					attr,
					`native state and identity attribute ${JSON.stringify(raw)} must be static or explicitly unbound`,
				);
			}
			if ((URL_ATTRS.has(lower) || name.includes(':')) && !shouldSanitizeURLAttribute(tag, name)) {
				if (value?.type === 'Literal') continue;
				error(
					filename,
					attr,
					'unsupported URL and namespaced attributes must be static or explicitly unbound',
				);
			}
			if (name === 'class' && hasPartialClass(value)) {
				if (!addClassGroups(index, attr, value)) addClassTokens(index, value);
			} else if (name === 'style') {
				if (
					value?.type !== 'ObjectExpression' ||
					value.properties.some(
						(property) => property.type === 'SpreadElement' || property.computed,
					)
				) {
					add(
						index,
						value?.type === 'Literal' ? 'styleAttribute' : 'styleObject',
						'style',
						value,
						attr,
					);
					continue;
				}
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
						: shouldSanitizeURLAttribute(tag, name)
							? 'url'
							: name.startsWith('aria-') ||
								  name.startsWith('data-') ||
								  isEnumeratedBooleanAttr(lower)
								? 'aria'
								: BOOLEAN_ATTR_PROPS.has(lower)
									? 'boolean'
									: 'attr';
				add(index, kind, name, value, attr);
			}
		}
		if (tag !== 'textarea') {
			for (const child of children) visit(child, index, ns, [...ancestors, tag]);
		}
	};
	visit(render, -1, native?.namespace ?? 0, native?.ancestors ?? []);
	return {
		fn,
		render,
		nodes,
		elements,
		addressed,
		bindings,
		values,
		projections,
		signalIndices,
		styleIndices,
		unbound,
		classAttributes,
		id,
	};
}

function literalData(value) {
	return Array.isArray(value) ? b.array(value.map(literalData)) : b.literal(value);
}

function scalarProperties(
	plan,
	project,
	classFactory,
	signalFactory = null,
	styleFactory = null,
	controlFactory = null,
) {
	return [
		b.prop('init', b.id('id'), b.literal(plan.id)),
		...(plan.addressed ? [b.prop('init', b.id('addressed'), b.literal(true))] : []),
		b.prop('init', b.id('nodes'), literalData(plan.nodes)),
		b.prop('init', b.id('bindings'), literalData(plan.bindings)),
		b.prop('init', b.id('project'), project),
		...(plan.signalIndices.length
			? [
					b.prop('init', b.id('signalIndices'), literalData(plan.signalIndices)),
					b.prop('init', b.id('connectSignal'), signalFactory),
				]
			: []),
		...(classFactory ? [b.prop('init', b.id('createClassGroup'), classFactory)] : []),
		...(styleFactory
			? [
					b.prop('init', b.id('styleIndices'), literalData(plan.styleIndices)),
					b.prop('init', b.id('connectStyle'), styleFactory),
				]
			: []),
		...(controlFactory ? [b.prop('init', b.id('createControls'), controlFactory)] : []),
	];
}

function projectProgram(ast, plan, filename, lexical) {
	const imports = importedBindings(ast);
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
		if (
			declaration.type === 'VariableDeclaration' &&
			declaration.kind === 'const' &&
			declaration.declarations.every((item) => item.id.type === 'Identifier' && item.init)
		) {
			for (const item of declaration.declarations)
				assertProjection(
					item.init,
					filename,
					imports,
					lexical,
					lexical.rootScope,
					new Set([item.id.name]),
				);
			continue;
		}
		error(
			filename,
			statement,
			'binding view modules cannot contain eager module initialization; pass state as props',
		);
	}
	const needed = new Set();
	const collect = (expression) =>
		walk(expression, (node, parent, key) => {
			if (node.type.startsWith('TS') && !UNWRAP.has(node.type)) return false;
			if (
				isRuntimeReference(node, lexical, parent, key) &&
				lexical.resolveBinding(lexical.nodeScopes.get(node) ?? lexical.rootScope, node.name)
					?.scope === lexical.rootScope
			) {
				if (needed.has(node.name)) return;
				needed.add(node.name);
				const declaration = lexical.domBindingConstants.get(node.name);
				if (declaration) collect(declaration.init);
			}
		});
	collect(plan.expressions ?? plan.values);
	collect(plan.projections?.map((declaration) => declaration.declarations[0].init));
	const importNodes = ast.body.flatMap((node) => {
		const declaration = node.declaration ?? node;
		if (declaration.type === 'VariableDeclaration' && declaration.kind === 'const') {
			const declarations = declaration.declarations.filter((item) => needed.has(item.id.name));
			return declarations.length ? [{ ...declaration, declarations }] : [];
		}
		if (node.type !== 'ImportDeclaration' || node.importKind === 'type') return [];
		if (node.specifiers.length === 0) return [node];
		const specifiers = node.specifiers.filter(
			(specifier) => specifier.importKind !== 'type' && needed.has(specifier.local.name),
		);
		return specifiers.length === 0 ? [] : [{ ...node, specifiers }];
	});
	if (plan.root) {
		const names = new Set([
			...needed,
			...plan.dependencies.flatMap((node) =>
				node.specifiers.map((specifier) => specifier.local.name),
			),
			...plan.hoists.flatMap((node) => node.declarations.map((item) => item.id.name)),
		]);
		const allocate = (prefix) => {
			let name = prefix;
			for (let index = 1; names.has(name); index++) name = `${prefix}${index}`;
			names.add(name);
			return name;
		};
		const adopt = allocate('_$adoptBindingProgram');
		const mount = allocate('_$mountBindingProgram');
		const adoptScalar = plan.scalar ? allocate('_$adoptScalarBindings') : null;
		const signalFactory = plan.signals ? allocate('_bindingSignals') : null;
		const styleFactory = plan.styles ? allocate('_bindingStyles') : null;
		const controlFactory = plan.controls ? allocate('_bindingControls') : null;
		// Imported child artifacts carry their optional capabilities. Forward a
		// factory rather than loading every capability for every parent view.
		const capability = (name, local) => {
			const value = local
				? b.id(local)
				: [...plan.childPrograms]
						.map((child) => b.member(b.id(child), name))
						.reduce((left, right) => (left ? b.logical('||', left, right) : right), null);
			return value ? [b.prop('init', b.id(name), value)] : [];
		};
		const root = plan.scalar ? b.id(allocate('_bindingRoot')) : null;
		const scalar =
			plan.scalar &&
			b.object(
				scalarProperties(
					plan.scalar,
					b.arrow(plan.fn.params, b.call(b.member(root, 'project'), b.array(plan.fn.params))),
					plan.scalar.bindings.some((binding) => binding[1] === 'classGroup')
						? b.member(root, 'createClassGroup')
						: null,
					signalFactory ? b.id(signalFactory) : null,
					styleFactory ? b.id(styleFactory) : null,
					controlFactory ? b.id(controlFactory) : null,
				),
			);
		return {
			...ast,
			body: [
				...importNodes,
				...plan.dependencies,
				...(styleFactory
					? [
							inheritHookMemoOrigin(
								b.imports([['__createBindingStyles', styleFactory]], 'octane/dom-binding-styles'),
								plan.fn,
							),
						]
					: []),
				...(controlFactory
					? [
							inheritHookMemoOrigin(
								b.imports(
									[['__createBindingControls', controlFactory]],
									'octane/dom-binding-controls',
								),
								plan.fn,
							),
						]
					: []),
				...(signalFactory
					? [
							inheritHookMemoOrigin(
								b.imports(
									[['__createBindingSignals', signalFactory]],
									'octane/dom-binding-signals',
								),
								plan.fn,
							),
						]
					: []),
				inheritHookMemoOrigin(
					b.imports(
						[
							['__adoptBindingProgram', adopt],
							['__mountBindingProgram', mount],
						],
						'octane/dom-binding-program',
					),
					plan.fn,
				),
				...(adoptScalar
					? [
							inheritHookMemoOrigin(
								b.imports([['__adoptBindings', adoptScalar]], 'octane/dom-bindings'),
								plan.fn,
							),
						]
					: []),
				...plan.hoists,
				...(root ? [inheritHookMemoOrigin(b.const(root, plan.root), plan.fn)] : []),
				inheritHookMemoOrigin(
					b.export_default(
						b.object([
							b.prop('init', b.id('id'), b.literal(plan.id)),
							b.prop('init', b.id('root'), root ?? plan.root),
							b.prop('init', b.id('adopt'), b.id(adopt)),
							b.prop('init', b.id('mount'), b.id(mount)),
							...(scalar ? [b.prop('init', b.id('scalar'), scalar)] : []),
							...(adoptScalar ? [b.prop('init', b.id('adoptScalar'), b.id(adoptScalar))] : []),
							...capability('connectStyle', styleFactory),
							...capability('createControls', controlFactory),
							...(signalFactory
								? [b.prop('init', b.id('connectSignal'), b.id(signalFactory))]
								: []),
						]),
					),
					plan.fn,
				),
			],
		};
	}
	const project = inheritHookMemoOrigin(
		b.arrow(
			plan.fn.params,
			plan.projections.length > 0
				? b.block([...plan.projections, b.return(b.array(plan.values))])
				: b.array(plan.values),
		),
		plan.fn,
	);
	let classFactory = null;
	let signalFactory = null;
	let styleFactory = null;
	let controlFactory = null;
	if (plan.styleIndices.length > 0) {
		styleFactory = lexical.domBindingAllocateName('_bindingStyles');
		importNodes.push(
			inheritHookMemoOrigin(
				b.imports([['__createBindingStyles', styleFactory]], 'octane/dom-binding-styles'),
				plan.fn,
			),
		);
	}
	if (plan.bindings.some((binding) => binding[1] === 'control')) {
		controlFactory = lexical.domBindingAllocateName('_bindingControls');
		importNodes.push(
			inheritHookMemoOrigin(
				b.imports([['__createBindingControls', controlFactory]], 'octane/dom-binding-controls'),
				plan.fn,
			),
		);
	}
	if (plan.signalIndices.length > 0) {
		signalFactory = lexical.domBindingAllocateName('_bindingSignals');
		importNodes.push(
			inheritHookMemoOrigin(
				b.imports([['__createBindingSignals', signalFactory]], 'octane/dom-binding-signals'),
				plan.fn,
			),
		);
	}
	if (plan.bindings.some((binding) => binding[1] === 'classGroup')) {
		classFactory = '_$createBindingClassGroup';
		while (needed.has(classFactory)) classFactory += '$';
		importNodes.push(
			inheritHookMemoOrigin(
				b.imports([['createBindingClassGroup', classFactory]], 'octane/dom-binding-classes'),
				plan.fn,
			),
		);
	}
	return {
		...ast,
		body: [
			...importNodes,
			inheritHookMemoOrigin(
				b.export_default(
					b.object(
						scalarProperties(
							plan,
							project,
							classFactory ? b.id(classFactory) : null,
							signalFactory ? b.id(signalFactory) : null,
							styleFactory ? b.id(styleFactory) : null,
							controlFactory ? b.id(controlFactory) : null,
						),
					),
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
				([, value]) =>
					value.source === 'octane/behavior' &&
					['adoptBindings', 'mountBindings'].includes(value.imported),
			)
			.map(([name]) => name),
	);
	if (intrinsics.size === 0) return ast;
	const lexical = createLexicalAnalysis(ast);
	const replacements = new Map();
	const consumed = new Set();
	const added = [];
	const names = new Set();
	const constructionRequests = new Set();
	walk(ast, (node) => {
		if (node.type === 'Identifier') names.add(node.name);
		if (
			node.type !== 'CallExpression' ||
			node.callee?.type !== 'Identifier' ||
			!intrinsics.has(node.callee.name) ||
			imports.get(node.callee.name).imported !== 'mountBindings' ||
			lexical.resolveBinding(lexical.nodeScopes.get(node.callee), node.callee.name)?.scope !==
				lexical.rootScope
		)
			return;
		const view = unwrap(node.arguments[1]);
		const imported = view?.type === 'Identifier' ? imports.get(view.name) : null;
		if (
			imported?.specifier.type === 'ImportSpecifier' &&
			lexical.resolveBinding(lexical.nodeScopes.get(view), view.name)?.scope === lexical.rootScope
		)
			constructionRequests.add(
				`${imported.source}?${DOM_BINDINGS_QUERY}=${encodeURIComponent(imported.imported)}`,
			);
	});
	const allocate = (prefix) => {
		let name = prefix;
		for (let index = 1; names.has(name); index++) name = `${prefix}${index}`;
		names.add(name);
		return name;
	};
	const helpers = new Map();
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
		const intrinsic = imports.get(node.callee.name).imported;
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
		let helper = helpers.get(intrinsic);
		if (helper === undefined) {
			helper = allocate(`_$${intrinsic}`);
			helpers.set(intrinsic, helper);
			added.push(
				inheritHookMemoOrigin(b.imports([[`__${intrinsic}`, helper]], 'octane/dom-bindings'), node),
			);
		}
		const adoptionRequest = `${imported.source}?${DOM_BINDINGS_QUERY}=${encodeURIComponent(imported.imported)}`;
		const request = `${adoptionRequest}${constructionRequests.has(adoptionRequest) ? `&${DOM_BINDINGS_MOUNT_QUERY}=1` : ''}`;
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
export function prepareDomBindings(ast, source, filename, selectedExport, helpers) {
	const imports = importedBindings(ast);
	const lexical = createLexicalAnalysis(ast);
	lexical.domBindingConstants = new Map(
		ast.body.flatMap((statement) => {
			const declaration = statement.declaration ?? statement;
			return declaration.type === 'VariableDeclaration' && declaration.kind === 'const'
				? declaration.declarations
						.filter((item) => item.id.type === 'Identifier' && item.init)
						.map((item) => [item.id.name, item])
				: [];
		}),
	);
	const plans = new Map();
	const replacements = new Map();
	const localFunctions = new Map(
		ast.body.flatMap((statement) => {
			const fn = statement.declaration ?? statement;
			return fn.type === 'FunctionDeclaration' && fn.id ? [[fn.id.name, fn]] : [];
		}),
	);
	const inProgress = new Set();
	const programPlans = new Map();
	const programNames = new Set(imports.keys());
	walk(ast, (node) => {
		if (node.type === 'Identifier') programNames.add(node.name);
	});
	const allocateProgramName = (prefix) => {
		let name = prefix;
		for (let i = 1; programNames.has(name); i++) name = `${prefix}${i}`;
		programNames.add(name);
		return name;
	};
	lexical.domBindingAllocateName = allocateProgramName;
	lexical.domBindingCanCarrySignal = helpers.canCarryDirectSignalHandle;
	const refCallbacks = [];
	walk(ast, (node) => {
		if ((node.type === 'JSXAttribute' || node.type === 'Attribute') && attrName(node) === 'ref') {
			const value = attrValueForBinding(node);
			if (['ArrowFunctionExpression', 'FunctionExpression'].includes(value?.type))
				refCallbacks.push(value);
		}
	});
	const refDependencies = refCallbacks.length
		? helpers.analyzeCallbackDependencies(ast, refCallbacks)
		: new Map();
	const isUnbound = (expression) => {
		const value = unwrap(expression);
		if (value?.type !== 'CallExpression' || value.callee.type !== 'Identifier') return false;
		const imported = imports.get(value.callee.name);
		return (
			imported?.source === 'octane/behavior' &&
			imported.imported === 'unbound' &&
			lexical.resolveBinding(lexical.nodeScopes.get(value.callee), value.callee.name)?.scope ===
				lexical.rootScope
		);
	};
	const programFor = (fn, render) => {
		if (programPlans.has(fn)) return programPlans.get(fn);
		if (inProgress.has(fn))
			error(filename, fn, 'recursive binding child programs are not supported');
		inProgress.add(fn);
		const setup = statements(fn)
			.filter((statement) => statement.type === 'VariableDeclaration')
			.flatMap((statement) => statement.declarations);
		for (const declaration of setup)
			assertProjection(
				declaration.init,
				filename,
				imports,
				lexical,
				lexical.nodeScopes.get(fn.body) ?? lexical.rootScope,
			);
		const setupBindings = new Map(
			setup.map((declaration) => [
				declaration.id.name,
				{
					scope: lexical.resolveBinding(
						lexical.nodeScopes.get(declaration.id) ?? lexical.nodeScopes.get(fn.body),
						declaration.id.name,
					)?.scope,
					declaration,
				},
			]),
		);
		const projectionBody = (value, expressions, temporaries = []) => {
			const required = new Set();
			const visit = (expression) =>
				walk(expression, (node, parent, key) => {
					if (!isRuntimeReference(node, lexical, parent, key)) return;
					const binding = setupBindings.get(node.name);
					const declaration =
						binding?.scope ===
						lexical.resolveBinding(lexical.nodeScopes.get(node) ?? lexical.rootScope, node.name)
							?.scope
							? binding?.declaration
							: undefined;
					if (!declaration || required.has(declaration)) return;
					required.add(declaration);
					visit(declaration.init);
				});
			visit(value);
			for (const temporary of temporaries) {
				const expression = temporary.declarations[0].init;
				visit(expression);
				expressions.push(expression);
			}
			if (required.size === 0 && temporaries.length === 0) return value;
			const declarations = setup.filter((declaration) => required.has(declaration));
			expressions.push(...declarations.map((declaration) => declaration.init));
			return b.block([
				...declarations.map((declaration) =>
					inheritHookMemoOrigin(b.const(declaration.id, declaration.init), declaration),
				),
				...temporaries,
				b.return(value),
			]);
		};
		const plan = planBindingProgram(fn, render, {
			source,
			filename,
			helpers,
			isUnbound,
			mapCow,
			imports,
			lexical,
			allocateProgramName,
			projectionBody,
			refDependencies: (expression) => refDependencies.get(unwrap(expression)) ?? null,
			isChildSlot: (expression) => {
				const value = unwrap(expression);
				const parameter = fn.params[0];
				return (
					value?.type === 'MemberExpression' &&
					!value.optional &&
					(value.computed ? value.property.value : value.property.name) === 'children' &&
					value.object.type === 'Identifier' &&
					value.object.name === parameter?.name &&
					lexical.resolveBinding(lexical.nodeScopes.get(value.object), value.object.name)?.scope ===
						lexical.resolveBinding(lexical.nodeScopes.get(parameter), parameter.name)?.scope
				);
			},
			canCarryValue: (expression) => {
				if (!helpers.canCarryDirectSignalHandle(expression)) return false;
				let renderable = false;
				walk(expression, (node) => {
					if (node.type.startsWith('JSX')) renderable = true;
				});
				return !renderable;
			},
			localProgram: (name) => {
				const child = localFunctions.get(name);
				return child ? programFor(child, bindingRender(child, filename, false)) : null;
			},
			nativePlan: (element, namespace, ancestors) =>
				planView(fn, filename, source, imports, lexical, { element, namespace, ancestors }),
			assertProjection: (expression) =>
				assertProjection(
					expression,
					filename,
					imports,
					lexical,
					lexical.nodeScopes.get(fn.body) ?? lexical.rootScope,
				),
			assertAdapter: (expression) =>
				walk(expression, (node, parent, key) => {
					if (node.type.startsWith('TS') && !UNWRAP.has(node.type)) return false;
					if (
						isRuntimeReference(node, lexical, parent, key) &&
						lexical.resolveBinding(lexical.nodeScopes.get(node) ?? lexical.rootScope, node.name)
							?.scope === lexical.rootScope &&
						!imports.has(node.name)
					)
						error(
							filename,
							node,
							'native adapters must receive module-local callbacks through props or imports',
						);
				}),
		});
		inProgress.delete(fn);
		programPlans.set(fn, plan);
		replacements.set(fn, { ...mapCow(fn, plan.replacements), _octaneBindingView: { id: plan.id } });
		return plan;
	};
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
		const render = bindingRender(node, filename);
		const structural =
			needsBindingProgram(render, isUnbound) ||
			statements(node).some((statement) => statement.type === 'VariableDeclaration');
		if (structural || (helpers.mount && selectedExport === node.id.name)) {
			const plan = programFor(node, render);
			if (!structural) plan.scalar = planView(node, filename, source, imports, lexical);
			plans.set(node.id.name, plan);
			return false;
		}
		const plan = planView(node, filename, source, imports, lexical);
		plans.set(node.id.name, plan);
		const rewritten = new Map([...plan.unbound, ...plan.classAttributes]);
		// Rewrite from leaves to root so parent replacements retain every child
		// address and stripped ownership intrinsic without mutating the parser AST.
		for (let index = plan.elements.length - 1; index >= 0; index--) {
			if (index !== 0 && !plan.addressed) continue;
			const element = plan.elements[index];
			const markers = [];
			if (index === 0) {
				markers.push(
					inheritHookMemoOrigin(b.jsx_attribute(b.jsx_id(MARKER), b.literal(plan.id)), element),
				);
			}
			if (plan.addressed) {
				markers.push(
					inheritHookMemoOrigin(
						b.jsx_attribute(b.jsx_id(NODE_MARKER), b.literal(`${plan.id}:${index}`)),
						element,
					),
				);
			}
			const target = mapCow(element, rewritten);
			rewritten.set(
				element,
				target.openingElement
					? {
							...target,
							openingElement: {
								...target.openingElement,
								attributes: [...target.openingElement.attributes, ...markers],
							},
						}
					: { ...target, attributes: [...target.attributes, ...markers] },
			);
		}
		for (const [node, replacement] of rewritten) replacements.set(node, replacement);
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
