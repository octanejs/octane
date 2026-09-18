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
import {
	parseDomBindingRequest,
	DOM_BINDINGS_QUERY,
	DOM_BINDINGS_MOUNT_QUERY,
} from './dom-binding-request.js';

export { DOM_BINDINGS_QUERY, DOM_BINDINGS_MOUNT_QUERY } from './dom-binding-request.js';
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
	return parseDomBindingRequest(id)?.exportName ?? null;
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
	return Array.isArray(fn.body?.body) ? fn.body.body : [];
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

function importedProjectionCall(node, imports, lexical, parameterScope) {
	const callee = unwrap(node?.callee);
	let importedRoot = callee;
	while (importedRoot?.type === 'MemberExpression' && !importedRoot.computed)
		importedRoot = unwrap(importedRoot.object);
	const namespace =
		importedRoot !== callee &&
		importedRoot?.type === 'Identifier' &&
		imports.get(importedRoot.name)?.specifier.type === 'ImportNamespaceSpecifier'
			? importedRoot
			: null;
	const reference = namespace ?? callee;
	const imported = reference?.type === 'Identifier' ? imports.get(reference.name) : null;
	return (
		imported != null &&
		lexical.resolveBinding(lexical.nodeScopes.get(reference) ?? parameterScope, reference.name)
			?.scope === lexical.rootScope &&
		!/^use(?:[A-Z]|$)/.test(namespace ? callee.property.name : (imported.imported ?? '')) &&
		imported.source !== 'octane' &&
		!imported.source.startsWith('octane/')
	);
}

function nativeProjectionReference(node, imports, lexical, parameterScope) {
	if (
		node.type !== 'CallExpression' ||
		node.optional ||
		node.arguments.some((argument) => argument.type === 'SpreadElement')
	)
		return null;
	const callee = unwrap(node.callee);
	const member = callee?.type === 'MemberExpression' && !callee.computed && !callee.optional;
	const reference = member ? unwrap(callee.object) : callee;
	if (reference?.type !== 'Identifier') return null;
	const binding = lexical.resolveBinding(
		lexical.nodeScopes.get(reference) ?? parameterScope,
		reference.name,
	);
	if (
		binding === null &&
		((!member && reference.name === 'String' && node.arguments.length <= 1) ||
			(member && reference.name === 'Math' && callee.property.name === 'min'))
	)
		return reference;
	const imported = imports.get(reference.name);
	return binding?.scope === lexical.rootScope &&
		imported?.source === 'octane/signals' &&
		node.arguments.length === 1 &&
		(member
			? imported.specifier.type === 'ImportNamespaceSpecifier' &&
				callee.property.name === 'isSignalHandle'
			: imported.imported === 'isSignalHandle')
		? reference
		: null;
}

function projectionFactoryConfiguration(expression, imports, lexical, parameterScope) {
	const value = unwrap(expression);
	return value?.type === 'CallExpression' &&
		!value.optional &&
		value.arguments.length === 1 &&
		unwrap(value.arguments[0])?.type === 'ObjectExpression' &&
		importedProjectionCall(value, imports, lexical, parameterScope)
		? unwrap(value.arguments[0])
		: null;
}

function expressionProjection(node) {
	return (
		node?.type === 'ArrowFunctionExpression' &&
		!node.async &&
		node.body.type !== 'BlockStatement' &&
		node.params.every((param) => param.type === 'Identifier')
	);
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
	const configuration =
		constants.size > 0
			? projectionFactoryConfiguration(expression, imports, lexical, parameterScope)
			: null;
	const configurationArrows = configuration ? new Set() : null;
	const collectConfiguration = (object) => {
		for (const property of object.properties) {
			if (
				property.type !== 'Property' ||
				property.kind !== 'init' ||
				property.method ||
				property.computed
			)
				continue;
			const value = unwrap(property.value);
			if (expressionProjection(value)) configurationArrows.add(value);
			else if (value?.type === 'ObjectExpression') collectConfiguration(value);
		}
	};
	if (configuration) collectConfiguration(configuration);
	const factoryProjection = (callee) => {
		const path = [];
		let receiver = callee;
		while (receiver?.type === 'MemberExpression' && !receiver.computed && !receiver.optional) {
			path.unshift(receiver.property.name);
			receiver = unwrap(receiver.object);
		}
		if (
			path.length === 0 ||
			/^use(?:[A-Z]|$)/.test(path.at(-1)) ||
			receiver?.type !== 'Identifier' ||
			lexical.resolveBinding(lexical.nodeScopes.get(receiver) ?? parameterScope, receiver.name)
				?.scope !== lexical.rootScope
		)
			return false;
		let value = projectionFactoryConfiguration(
			lexical.domBindingConstants?.get(receiver.name)?.init,
			imports,
			lexical,
			parameterScope,
		);
		for (const name of path) {
			if (
				name === '__proto__' ||
				value?.type !== 'ObjectExpression' ||
				value.properties.some((property) => property.type !== 'Property' || property.computed)
			)
				return false;
			const members = value.properties.filter(
				(property) => (property.key.name ?? property.key.value) === name,
			);
			if (members.length !== 1 || members[0].kind !== 'init' || members[0].method) return false;
			value = unwrap(members[0].value);
		}
		// The directive requires the provider to preserve its pure projections;
		// this is an author/provider assertion, not an analysis of imported code.
		// A result grants no arbitrary methods: the exact static member must come
		// from a checked projection in the immutable literal configuration.
		return expressionProjection(value);
	};
	// Like imported projections, these native reads rely on the directive's
	// immutable-props/import contract. A string result cast does not admit arbitrary
	// methods: every call in a chain must independently satisfy this boundary.
	const readReceiver = (input) => {
		let receiver = unwrap(input);
		if (receiver?.type === 'ChainExpression') return readReceiver(receiver.expression);
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
		return binding != null && (binding.scope !== lexical.rootScope || imports.has(receiver.name));
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
		return readReceiver(callee.object);
	};
	const nativeReferences = new Set();
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
			(configurationArrows !== null &&
				['ThisExpression', 'Super', 'MetaProperty', 'ImportExpression'].includes(node.type)) ||
			(['FunctionExpression', 'ArrowFunctionExpression'].includes(node.type) &&
				!configurationArrows?.has(node) &&
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
			if (
				binding === null &&
				!nativeReferences.has(node) &&
				!['undefined', 'NaN', 'Infinity'].includes(node.name)
			) {
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
			if (lexical.domBindingCallback?.(node))
				error(filename, node, 'local callbacks are supported only as native adapters');
		}
		if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			const callee = unwrap(node.callee);
			const native = nativeProjectionReference(node, imports, lexical, parameterScope);
			if (native) nativeReferences.add(native);
			if (
				native ||
				node.metadata?.octaneNativeSignalRead ||
				readMethod(node) ||
				importedProjectionCall(node, imports, lexical, parameterScope) ||
				factoryProjection(callee)
			)
				return;
			error(
				filename,
				node,
				'calls in bindings must be imported pure projections, not hooks or live accessors',
			);
		}
	});
}

function bindingParameterNames(parameter, filename) {
	if (parameter?.type !== 'ObjectPattern') return [parameter?.name ?? null];
	return parameter.properties.map((property, index) => {
		if (
			property.type === 'RestElement' &&
			property.argument.type === 'Identifier' &&
			index === parameter.properties.length - 1
		)
			return property.argument.name;
		const value = property.value;
		const binding = value?.type === 'AssignmentPattern' ? value.left : value;
		if (
			property.type !== 'Property' ||
			property.kind !== 'init' ||
			property.method ||
			property.computed ||
			!['Identifier', 'Literal'].includes(property.key.type) ||
			binding?.type !== 'Identifier' ||
			(value.type === 'AssignmentPattern' &&
				(value.right.type !== 'Literal' ||
					(value.right.value !== null &&
						!['string', 'number', 'boolean'].includes(typeof value.right.value))))
		)
			error(
				filename,
				property,
				'binding props support only flat static names, literal defaults, and rest',
			);
		return binding.name;
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
		(fn.params.length === 1 && !['Identifier', 'ObjectPattern'].includes(fn.params[0].type))
	) {
		error(
			filename,
			fn,
			'a binding view needs an ordinary props parameter and one template output, without early returns',
		);
	}
	bindingParameterNames(fn.params[0], filename);
	return render;
}

function bindingRestSpreads(fn, render, props, lexical, filename) {
	const parameter = fn.params[0];
	const rest =
		parameter?.type === 'ObjectPattern'
			? parameter.properties.find((property) => property.type === 'RestElement')?.argument
			: null;
	if (!rest) return { render, hasRest: false };
	const scope = lexical.resolveBinding(lexical.nodeScopes.get(rest), rest.name)?.scope;
	const consumed = new Set(
		parameter.properties
			.filter((property) => property.type === 'Property')
			.map((property) => String(property.key.name ?? property.key.value)),
	);
	const keys = props?.filter((name) => !consumed.has(name));
	const replacements = new Map();
	const sites = new Map();
	let nextSite = 0;
	let conditional = keys?.every(
		(name) =>
			name === 'ref' || /^on[A-Z]/.test(name) || /^(?:aria|data)-[a-z][a-z0-9-]*$/.test(name),
	);
	let hasRest = false;
	walk(render, (node) => {
		if (
			['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
		)
			return false;
		if (
			!['JSXElement', 'Element'].includes(node.type) ||
			!/^[a-z]/.test(node.openingElement?.name?.name ?? node.id?.name ?? '')
		)
			return;
		const attributes = node.openingElement?.attributes ?? node.attributes ?? [];
		const nativeSites = [];
		let spread = 0;
		for (const attribute of attributes) {
			if (!['JSXSpreadAttribute', 'SpreadAttribute'].includes(attribute.type)) continue;
			const ordinal = spread++;
			const value = unwrap(attribute.argument);
			if (
				value?.type !== 'Identifier' ||
				value.name !== rest.name ||
				lexical.resolveBinding(lexical.nodeScopes.get(value), value.name)?.scope !== scope
			)
				continue;
			hasRest = true;
			nativeSites.push({ attribute, site: nextSite++, spread: ordinal, keys });
			if (
				['input', 'textarea', 'select'].includes(node.openingElement?.name?.name ?? node.id?.name)
			)
				conditional = false;
			if (keys === undefined) continue;
			if (keys.some((name) => ['class', 'className'].includes(name)))
				error(filename, attribute, 'closed binding rest cannot supply class groups');
			replacements.set(
				attribute,
				keys.map((name) =>
					inheritHookMemoOrigin(
						b.jsx_attribute(
							b.jsx_id(name),
							b.jsx_expression_container(b.member(value, b.literal(name), true)),
						),
						attribute,
					),
				),
			);
		}
		if (nativeSites.length > 0) sites.set(attributes, nativeSites);
		if (!attributes.some((attribute) => replacements.has(attribute))) return;
		const expanded = attributes.flatMap((attribute) => replacements.get(attribute) ?? [attribute]);
		sites.set(expanded, nativeSites);
		const names = new Set();
		for (const attribute of expanded) {
			const raw = attrName(attribute);
			if (typeof raw !== 'string') continue;
			const name = (
				raw === 'className'
					? 'class'
					: (ATTRIBUTE_ALIASES.get(raw) ??
						raw.replace(
							/^on(DoubleClick|Focus|Blur)(Capture)?$/,
							(_, event, capture = '') =>
								`on${event === 'DoubleClick' ? 'dblclick' : event === 'Focus' ? 'focusin' : 'focusout'}${capture}`,
						))
			).toLowerCase();
			if (names.has(name))
				error(
					filename,
					attribute,
					'closed binding rest cannot collide with another native attribute',
				);
			names.add(name);
		}
		replacements.set(attributes, expanded);
	});
	// Only replace attribute lists. The original rest reference retains lexical
	// provenance, and neither the authored function nor its parameter is rewritten.
	for (const [node] of replacements) if (!Array.isArray(node)) replacements.delete(node);
	return { render: mapCow(render, replacements), hasRest, sites, conditional };
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
	const projectionGroups = [];
	const providerBindings = new Set();
	const unboundAttributes = new Set();
	const classAttributes = new Map();
	const id = `d:${strongHash(`octane:dom-bindings:2\0${filename}\0${fn.id.name}\0${source}`)}`;
	const parameterScope = lexical.nodeScopes.get(fn.body) ?? lexical.rootScope;
	const unbound = new Map();
	let addressed = false;
	const markUnbound = (expression, opaque = false) => {
		const value = unwrap(expression);
		const callee = unwrap(value?.callee);
		const external =
			value?.type === 'CallExpression' && callee?.type === 'Identifier'
				? imports.get(callee.name)
				: null;
		if (
			external?.source !== 'octane/behavior' ||
			external.imported !== 'unbound' ||
			lexical.resolveBinding(lexical.nodeScopes.get(callee), callee.name)?.scope !==
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
		// A scalar leaf has one stable Text node (or no node for empty SSR).
		// Structural or opaque children retain their existing compiler contract.
		const child = children.length === 1 ? children[0] : null;
		const expression = child?.type === 'JSXExpressionContainer' ? child.expression : null;
		const text =
			tag !== 'textarea' &&
			authoredChildren.length === children.length &&
			(child?.type === 'JSXText' ||
				(expression?.type === 'Literal' && typeof expression.value === 'string') ||
				(expression?.type === 'TSAsExpression' &&
					(expression.typeAnnotation.type === 'TSStringKeyword' ||
						expression.typeAnnotation.type === 'TSNumberKeyword')));
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
			(opaqueChildren && !openChildren) || tag === 'textarea' ? null : text ? 0 : children.length,
			...(text ? [null, 1] : openChildren ? [true] : []),
		]);
		elements.push(element);
		const owned = new Set();
		const externalNames = new Set();
		const knownFields = new Set();
		for (const attr of element.openingElement?.attributes ?? element.attributes ?? []) {
			// A provider proves normal-renderer fields, not early ownership. External
			// spreads retain the ordinary unbound checks and are stripped below.
			if (attr._octaneKnownAttributeSpread && !attr._octaneKnownAttributeSpread.unbound) {
				const argument = attr.argument ?? attr.value.expression;
				// The compiler verified the exact imported factory against its
				// provider contract. Its arguments still need the ordinary proof.
				for (const value of argument.arguments)
					assertProjection(value, filename, imports, lexical, parameterScope);
				const temporary = b.id(lexical.domBindingAllocateName('_bindingAttrs'));
				const group = attr._octaneKnownAttributeSpread.projection ? [] : null;
				if (group) projectionGroups.push(group);
				else projections.push(inheritHookMemoOrigin(b.const(temporary, argument), attr));
				for (const raw of attr._octaneKnownAttributeSpread.fields) {
					let name = raw === 'className' ? 'class' : (ATTRIBUTE_ALIASES.get(raw) ?? raw);
					if (ns === 0) name = name.toLowerCase();
					const lower = name.toLowerCase();
					if (
						FORBIDDEN_ATTRS.has(lower) ||
						lower.startsWith('on') ||
						lower.startsWith('data-octane-class-') ||
						externalAttribute(tag, lower) ||
						((URL_ATTRS.has(lower) || name.includes(':')) && !shouldSanitizeURLAttribute(tag, name))
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
					if (group) group.push([bindings.length, raw]);
					if (name === 'style' && attr._octaneKnownAttributeSpread.style === 'object') {
						if (!group) styleIndices.push(bindings.length);
						bindings.push([index, 'styleObject', name]);
					} else {
						if (!group) signalIndices.push(bindings.length);
						bindings.push([index, bindingKind(tag, name), name]);
					}
					providerBindings.add(bindings.length - 1);
					values.push(
						group
							? inheritHookMemoOrigin(
									group.length === 1 ? b.arrow([], argument) : b.literal(null),
									attr,
								)
							: inheritHookMemoOrigin(
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
			if (attr.type === 'JSXSpreadAttribute' || attr.type === 'SpreadAttribute') {
				if (!markUnbound(attr.argument))
					error(filename, attr, 'binding attribute spreads must be explicitly unbound');
				if (bindings.some((binding) => binding[0] === index))
					error(filename, attr, 'unbound attribute spreads must precede owned binding attributes');
				const addExternalName = (raw, node) => {
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
							node,
							`unbound spreads cannot supply reserved or structural attribute ${JSON.stringify(raw)}`,
						);
					externalNames.add(name);
				};
				const external = unwrap(unwrap(attr.argument).arguments[0]);
				if (attr._octaneKnownAttributeSpread) {
					for (const raw of attr._octaneKnownAttributeSpread.fields) addExternalName(raw, attr);
				} else if (external?.type === 'ObjectExpression') {
					for (const property of external.properties) {
						if (property.type !== 'Property' || property.computed) continue;
						const raw = property.key.name ?? property.key.value;
						if (typeof raw !== 'string') continue;
						addExternalName(raw, property);
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
			const value =
				attr.value === null
					? b.literal(true)
					: unwrap(
							attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr.value,
						);
			if ((lower === 'ref' || /^on[A-Z]/.test(raw)) && markUnbound(value)) {
				unboundAttributes.add(lower);
				continue;
			}
			if (
				!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name) ||
				FORBIDDEN_ATTRS.has(lower) ||
				lower.startsWith('data-octane-class-')
			) {
				error(filename, attr, `attribute ${JSON.stringify(raw)} is not supported in binding views`);
			}
			if (markUnbound(value)) {
				unboundAttributes.add(lower);
				continue;
			}
			// Explicitly unbound handlers remain with the normal renderer.
			if (lower.startsWith('on'))
				error(filename, attr, 'event handlers must be explicitly unbound');
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
		if (text) {
			if (expression) add(index, 'text', '#text', expression, child);
		} else if (tag !== 'textarea') {
			for (const child of children) visit(child, index, ns, [...ancestors, tag]);
		}
	};
	visit(render, -1, native?.namespace ?? 0, native?.ancestors ?? []);
	// Opaque descendants are outside this receipt. Only a scalar native host's
	// declared presentation channels can transfer independently of those children.
	const hostHandoff =
		nodes.length === 1 &&
		nodes[0][3] === null &&
		!addressed &&
		!['textarea', 'input', 'select'].includes(nodes[0][1]) &&
		bindings.length > 0 &&
		bindings.every(
			(binding, index) =>
				binding[0] === 0 &&
				(['class', 'styleProperty', 'styleAttribute', 'styleObject'].includes(binding[1]) ||
					(binding[1] === 'aria' &&
						((binding[2].startsWith('data-') && !binding[2].startsWith('data-octane-')) ||
							binding[2].startsWith('aria-'))) ||
					(binding[1] === 'attr' && binding[2] === 'tabindex') ||
					providerBindings.has(index)),
		) &&
		[...(render.openingElement?.attributes ?? render.attributes ?? [])].every(
			(attr) =>
				!['JSXSpreadAttribute', 'SpreadAttribute'].includes(attr.type) ||
				(attr._octaneKnownAttributeSpread && !attr._octaneKnownAttributeSpread.unbound),
		) &&
		!(render.openingElement?.attributes ?? render.attributes ?? []).some(
			(attr) => attrName(attr)?.toLowerCase() === 'dangerouslysetinnerhtml',
		);
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
		projectionGroups,
		unbound,
		classAttributes,
		id,
		hostHandoff,
		unboundAttributes,
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
	projectionFactory = null,
) {
	return [
		b.prop('init', b.id('id'), b.literal(plan.id)),
		...(plan.addressed ? [b.prop('init', b.id('addressed'), b.literal(true))] : []),
		b.prop('init', b.id('nodes'), literalData(plan.nodes)),
		b.prop('init', b.id('bindings'), literalData(plan.bindings)),
		b.prop('init', b.id('project'), project),
		...(plan.hostHandoff ? [b.prop('init', b.id('handoff'), b.literal('host'))] : []),
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
		...(projectionFactory
			? [
					b.prop('init', b.id('projectionGroups'), literalData(plan.projectionGroups)),
					b.prop('init', b.id('connectProjection'), projectionFactory),
				]
			: []),
	];
}

function projectionDependencies(plan, lexical) {
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
	collect(plan.scalar?.values);
	collect(plan.scalar?.projections?.map((declaration) => declaration.declarations[0].init));
	collect(plan.projections?.map((declaration) => declaration.declarations[0].init));
	return needed;
}

// A const declaration does not make its object immutable. Sharing is only safe
// when every use terminates in a known style consumer, including uses through
// local palettes/aliases. Unrelated exports and imperative callbacks stay local.
function shareableConstants(ast, names, lexical, imports) {
	const parents = new WeakMap();
	const aliases = new Map();
	const references = new Map();
	const bindings = new WeakMap();
	const resolve = (node) => {
		const scope = lexical.resolveBinding(
			lexical.nodeScopes.get(node) ?? lexical.rootScope,
			node.name,
		)?.scope;
		if (!scope) return null;
		if (!bindings.has(scope)) bindings.set(scope, new Map());
		const names = bindings.get(scope);
		if (!names.has(node.name)) names.set(node.name, { scope, name: node.name });
		return names.get(node.name);
	};
	walk(ast, (node, parent, key) => {
		parents.set(node, { parent, key });
		if (
			node.type === 'VariableDeclarator' &&
			node.id.type === 'Identifier' &&
			parent.kind === 'const' &&
			parents.get(parent)?.parent?.type !== 'ExportNamedDeclaration'
		)
			aliases.set(node, resolve(node.id));
		if (isRuntimeReference(node, lexical, parent, key)) {
			const binding = resolve(node);
			if (!references.has(binding)) references.set(binding, []);
			references.get(binding).push(node);
		}
	});
	const styleConsumer = (call) => {
		const callee = unwrap(call.callee);
		const member = callee?.type === 'MemberExpression' && !callee.computed;
		const provider = member ? unwrap(callee.object) : callee;
		const imported = provider?.type === 'Identifier' ? imports.get(provider.name) : null;
		return (
			imported &&
			['@octanejs/stylex', '@stylexjs/stylex'].includes(imported.source) &&
			resolve(provider)?.scope === lexical.rootScope &&
			['props', 'attrs'].includes(member ? callee.property.name : imported.imported)
		);
	};
	const checked = new Map();
	const dynamicRecipe = (call, reference) => {
		const callee = unwrap(call.callee);
		if (callee?.type !== 'MemberExpression' || callee.computed || callee.object !== reference)
			return false;
		const definition = lexical.domBindingConstants.get(reference.name)?.init;
		return (
			definition?.type === 'CallExpression' &&
			definition.arguments[0]?.properties?.some(
				(property) =>
					(property.key?.name ?? property.key?.value) === callee.property.name &&
					['ArrowFunctionExpression', 'FunctionExpression'].includes(property.value?.type),
			)
		);
	};
	const safe = (binding, visiting = new Set()) => {
		if (checked.has(binding)) return checked.get(binding);
		if (!binding || visiting.has(binding)) return false;
		const next = new Set(visiting).add(binding);
		const valid = (references.get(binding) ?? []).every((reference) => {
			let node = reference;
			while (parents.has(node)) {
				const { parent, key } = parents.get(node);
				if (!parent) return false;
				if (
					UNWRAP.has(parent.type) ||
					[
						'MemberExpression',
						'OptionalMemberExpression',
						'Property',
						'ObjectExpression',
						'ArrayExpression',
						'ConditionalExpression',
						'LogicalExpression',
						'JSXExpressionContainer',
					].includes(parent.type)
				) {
					node = parent;
					continue;
				}
				if (parent.type === 'VariableDeclarator' && key === 'init')
					return safe(aliases.get(parent), next);
				if (parent.type === 'JSXAttribute') {
					const tag = parents.get(parent)?.parent?.name;
					return (
						attrName(parent) === 'sx' && tag?.type === 'JSXIdentifier' && /^[a-z]/.test(tag.name)
					);
				}
				if (parent.type === 'CallExpression') {
					if (key !== 'callee') return styleConsumer(parent);
					if (!dynamicRecipe(parent, reference)) return false;
					// Dynamic recipes may return shared hoisted class data. Their
					// result must not escape to an imperative consumer either.
					node = parent;
					continue;
				}
				return false;
			}
			return false;
		});
		checked.set(binding, valid);
		return valid;
	};
	return names.filter((name) => safe(resolve(lexical.domBindingConstants.get(name).id)));
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
	const needed = projectionDependencies(plan, lexical);
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
		const hostCapability = plan.hostOperations ? allocate('_bindingHostOperations') : null;
		const initialCapability = plan.initialOperations ? allocate('_bindingInitialOperations') : null;
		const listCapability = plan.lists ? allocate('_bindingList') : null;
		const projectionFactory = plan.projectionsEnabled ? allocate('_bindingProjections') : null;
		// Imported child artifacts carry their optional capabilities. Forward a
		// factory rather than loading every capability for every parent view.
		const capability = (name, local) => {
			const value = local
				? b.id(local)
				: [...plan.childPrograms]
						.map((child) =>
							name === 'initialOperations'
								? b.logical(
										'??',
										b.member(b.id(child), name),
										b.logical(
											'??',
											b.member(b.id(child), 'hostOperations'),
											b.member(b.member(b.id(child), 'adopt'), 'hostOperations'),
										),
									)
								: name === 'list' || name === 'hostOperations'
									? b.logical(
											'??',
											b.member(b.id(child), name),
											b.member(b.member(b.id(child), 'adopt'), name),
										)
									: b.member(b.id(child), name),
						)
						.reduce((left, right) => (left ? b.logical('||', left, right) : right), null);
			return value ? [b.prop('init', b.id(name), value)] : [];
		};
		const root = plan.scalar ? b.id(allocate('_bindingRoot')) : null;
		const scalar =
			plan.scalar &&
			b.object(
				scalarProperties(
					plan.scalar,
					inheritHookMemoOrigin(
						b.arrow(
							plan.fn.params,
							plan.scalar.projections.length > 0
								? b.block([...plan.scalar.projections, b.return(b.array(plan.scalar.values))])
								: b.array(plan.scalar.values),
						),
						plan.fn,
					),
					plan.scalar.bindings.some((binding) => binding[1] === 'classGroup')
						? b.member(root, 'createClassGroup')
						: null,
					signalFactory ? b.id(signalFactory) : null,
					styleFactory ? b.id(styleFactory) : null,
					controlFactory ? b.id(controlFactory) : null,
					projectionFactory ? b.id(projectionFactory) : null,
				),
			);
		return {
			...ast,
			body: [
				...importNodes,
				...plan.dependencies,
				...(projectionFactory
					? [
							inheritHookMemoOrigin(
								b.imports(
									[['__createBindingProjections', projectionFactory]],
									'octane/dom-binding-projections',
								),
								plan.fn,
							),
						]
					: []),
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
							['__adoptLeanBindingProgram', adopt],
							['__mountLeanBindingProgram', mount],
							...(listCapability ? [['__bindingList', listCapability]] : []),
							...(hostCapability ? [['__bindingProgramHostOperations', hostCapability]] : []),
							...(initialCapability ? [['__bindingProgramInitializers', initialCapability]] : []),
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
							...(plan.prepareProps
								? [b.prop('init', b.id('prepareProps'), plan.prepareProps)]
								: []),
							b.prop('init', b.id('adopt'), b.id(adopt)),
							b.prop('init', b.id('mount'), b.id(mount)),
							...(scalar ? [b.prop('init', b.id('scalar'), scalar)] : []),
							...(adoptScalar ? [b.prop('init', b.id('adoptScalar'), b.id(adoptScalar))] : []),
							...capability('connectStyle', styleFactory),
							...capability('connectProjection', projectionFactory),
							...capability('createControls', controlFactory),
							...capability('list', listCapability),
							...capability('hostOperations', hostCapability),
							...capability('initialOperations', initialCapability),
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
	let projectionFactory = null;
	if (plan.projectionGroups.length > 0) {
		projectionFactory = lexical.domBindingAllocateName('_bindingProjections');
		importNodes.push(
			inheritHookMemoOrigin(
				b.imports(
					[['__createBindingProjections', projectionFactory]],
					'octane/dom-binding-projections',
				),
				plan.fn,
			),
		);
	}
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
	const adopt = lexical.domBindingAllocateName('_$adoptBindings');
	importNodes.push(
		inheritHookMemoOrigin(b.imports([['__adoptBindings', adopt]], 'octane/dom-bindings'), plan.fn),
	);
	return {
		...ast,
		body: [
			...importNodes,
			inheritHookMemoOrigin(
				b.export_default(
					b.object([
						b.prop('init', b.id('adopt'), b.id(adopt)),
						...scalarProperties(
							plan,
							project,
							classFactory ? b.id(classFactory) : null,
							signalFactory ? b.id(signalFactory) : null,
							styleFactory ? b.id(styleFactory) : null,
							controlFactory ? b.id(controlFactory) : null,
							projectionFactory ? b.id(projectionFactory) : null,
						),
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
		if (intrinsic === 'mountBindings' && helper === undefined) {
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
		// The artifact selects its own implementation. A generic adopter would
		// retain fixed-layout machinery even when every view is structural.
		replacements.set(
			node.callee,
			inheritHookMemoOrigin(
				intrinsic === 'adoptBindings' ? b.member(b.id(local), 'adopt') : b.id(helper),
				node.callee,
			),
		);
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
	const localConstants = new Map();
	walk(ast, (node) => {
		if (node.type === 'Identifier') programNames.add(node.name);
		if (node.type === 'VariableDeclaration' && node.kind === 'const') {
			for (const declaration of node.declarations) {
				if (declaration.id.type !== 'Identifier' || !declaration.init) continue;
				const scope = lexical.resolveBinding(
					lexical.nodeScopes.get(declaration.id),
					declaration.id.name,
				)?.scope;
				if (!scope || scope === lexical.rootScope) continue;
				if (!localConstants.has(scope)) localConstants.set(scope, new Map());
				localConstants.get(scope).set(declaration.id.name, declaration);
			}
		}
	});
	const localDeclaration = (node) =>
		node?.type === 'Identifier'
			? localConstants
					.get(lexical.resolveBinding(lexical.nodeScopes.get(node), node.name)?.scope)
					?.get(node.name)
			: null;
	const callbackFor = (expression) => {
		let value = unwrap(expression);
		const seen = new Set();
		while (value?.type === 'Identifier') {
			const declaration = localDeclaration(value);
			if (!declaration || seen.has(declaration)) return null;
			seen.add(declaration);
			value = unwrap(declaration.init);
		}
		return ['ArrowFunctionExpression', 'FunctionExpression'].includes(value?.type) ? value : null;
	};
	lexical.domBindingCallback = callbackFor;
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
			const callback = callbackFor(attrValueForBinding(node));
			if (callback) refCallbacks.push(callback);
		}
	});
	const refDependencies = refCallbacks.length
		? helpers.analyzeCallbackDependencies(ast, refCallbacks)
		: new Map();
	const isUnbound = (expression) => {
		const value = unwrap(expression);
		const callee = unwrap(value?.callee);
		if (value?.type !== 'CallExpression' || callee?.type !== 'Identifier') return false;
		const imported = imports.get(callee.name);
		return (
			imported?.source === 'octane/behavior' &&
			imported.imported === 'unbound' &&
			lexical.resolveBinding(lexical.nodeScopes.get(callee), callee.name)?.scope ===
				lexical.rootScope
		);
	};
	const programFor = (fn, render, props = null, annotationsOnly = false) => {
		const key = annotationsOnly ? 'annotations' : JSON.stringify(props);
		if (programPlans.get(fn)?.has(key)) return programPlans.get(fn).get(key);
		if (inProgress.has(fn))
			error(filename, fn, 'recursive binding child programs are not supported');
		inProgress.add(fn);
		const rest = bindingRestSpreads(fn, render, props, lexical, filename);
		const setup = statements(fn)
			.filter((statement) => statement.type === 'VariableDeclaration')
			.flatMap((statement) => statement.declarations);
		for (const declaration of annotationsOnly ? [] : setup)
			if (!callbackFor(declaration.init))
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
		const context = {
			source,
			filename,
			helpers,
			isUnbound,
			mapCow,
			imports,
			lexical,
			allocateProgramName,
			projectionBody,
			annotationsOnly,
			restSites: rest.sites,
			parameterNames: bindingParameterNames(fn.params[0], filename),
			refDependencies: (expression) => {
				const records = refDependencies.get(callbackFor(expression)) ?? null;
				if (records?.some((record) => callbackFor(record.node)))
					error(filename, expression, 'native ref callbacks cannot capture local callbacks');
				return records;
			},
			isChildSlot: (expression) => {
				const value = unwrap(expression);
				const parameter = fn.params[0];
				const member =
					value?.type === 'MemberExpression' &&
					!value.optional &&
					(value.computed ? value.property.value : value.property.name) === 'children';
				let reference = member ? value.object : null;
				let binding = parameter;
				if (parameter?.type === 'ObjectPattern') {
					const children = parameter.properties.find(
						(property) =>
							property.type === 'Property' &&
							(property.key.name ?? property.key.value) === 'children' &&
							(member ||
								(property.value.type === 'AssignmentPattern' ? property.value.left : property.value)
									.name === value?.name),
					);
					if (member) {
						if (children) return false;
						binding = parameter.properties.find(
							(property) => property.type === 'RestElement',
						)?.argument;
					} else {
						reference = value;
						binding = children?.value;
					}
				}
				const fallback = binding?.type === 'AssignmentPattern' ? binding.right : null;
				if (fallback) binding = binding.left;
				const matches =
					reference?.type === 'Identifier' &&
					reference.name === binding?.name &&
					lexical.resolveBinding(lexical.nodeScopes.get(reference), reference.name)?.scope ===
						lexical.resolveBinding(lexical.nodeScopes.get(binding), binding.name)?.scope;
				if (matches && fallback && fallback.value !== null)
					error(filename, fallback, 'binding child slot defaults must be null');
				return matches;
			},
			canCarryValue: (expression) => {
				if (!helpers.canCarryDirectSignalHandle(expression)) return false;
				let renderable = false;
				walk(expression, (node) => {
					if (node.type.startsWith('JSX')) renderable = true;
				});
				return !renderable;
			},
			localProgram: (name, props, annotationsOnly = false) => {
				const child = localFunctions.get(name);
				return child
					? programFor(child, bindingRender(child, filename, false), props, annotationsOnly)
					: null;
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
			assertAdapter: (expression) => {
				const seen = new Set();
				const visit = (value) =>
					walk(value, (node, parent, key) => {
						if (node.type.startsWith('TS') && !UNWRAP.has(node.type)) return false;
						if (!isRuntimeReference(node, lexical, parent, key)) return;
						if (
							lexical.resolveBinding(lexical.nodeScopes.get(node) ?? lexical.rootScope, node.name)
								?.scope === lexical.rootScope &&
							!imports.has(node.name)
						)
							error(
								filename,
								node,
								'native adapters must receive module-local callbacks through props or imports',
							);
						const declaration = localDeclaration(node);
						if (declaration && callbackFor(declaration.init) && !seen.has(declaration)) {
							seen.add(declaration);
							visit(declaration.init);
						}
					});
				visit(expression);
			},
		};
		const plan = planBindingProgram(fn, rest.render, context);
		inProgress.delete(fn);
		if (!programPlans.has(fn)) programPlans.set(fn, new Map());
		programPlans.get(fn).set(key, plan);
		const authored =
			!annotationsOnly && rest.hasRest
				? planBindingProgram(fn, render, { ...context, annotationsOnly: true })
				: plan;
		if (annotationsOnly) {
			const structuralPresentation =
				!rest.hasRest && plan.structural && fn.body.type === 'JSXCodeBlock';
			replacements.set(fn, {
				...mapCow(fn, authored.replacements),
				_octaneBindingView: { id: plan.id },
				_octanePresentationHydration: {
					id: plan.id,
					supported: structuralPresentation,
					...(structuralPresentation ? { structural: true } : {}),
					...(rest.hasRest && fn.body.type === 'JSXCodeBlock'
						? { structural: true, conditionalRest: true }
						: {}),
				},
			});
			return plan;
		}
		const field = (name) =>
			plan.root.properties.find((property) => property.key.name === name)?.value;
		const fixedPresentation =
			!rest.hasRest &&
			fn.body.type === 'JSXCodeBlock' &&
			!plan.controls &&
			field('regions').elements.length === 0 &&
			field('bindings').elements.every((binding) => binding.elements[1].value !== 'text');
		const conditionalRest =
			rest.hasRest && rest.conditional && plan.structural && fn.body.type === 'JSXCodeBlock';
		plan.structural &&= !rest.hasRest && fn.body.type === 'JSXCodeBlock';
		const structuralPresentation = !fixedPresentation && plan.structural;
		let createHandoff;
		if (structuralPresentation || conditionalRest) {
			createHandoff = allocateProgramName('_bindingHandoff');
			plan.dependencies.push(
				inheritHookMemoOrigin(
					b.imports(
						[['__createStructuralBindingHandoff', createHandoff]],
						'octane/dom-binding-program',
					),
					fn,
				),
			);
		}
		plan.root = {
			...plan.root,
			properties: [
				...plan.root.properties,
				b.prop(
					'init',
					b.id('handoff'),
					b.literal(structuralPresentation ? 'structural' : fixedPresentation),
				),
				...(createHandoff ? [b.prop('init', b.id('createHandoff'), b.id(createHandoff))] : []),
				// A receipt is not a lease capability. The runtime must explicitly
				// validate the caller/range and prepare its host writers before takeover.
				...(rest.hasRest && props !== null
					? [b.prop('init', b.id('closedProps'), b.array(props.map((name) => b.literal(name))))]
					: []),
				...(conditionalRest ? [b.prop('init', b.id('conditionalRest'), b.literal(true))] : []),
			],
		};
		replacements.set(fn, {
			...mapCow(fn, authored.replacements),
			_octaneBindingView: { id: plan.id },
			// Normal renderer ownership transfer is narrower than binding-program
			// adoption. Keep its proof separate from the existing SSR view stamp.
			_octanePresentationHydration: {
				id: plan.id,
				supported: fixedPresentation || structuralPresentation,
				...(field('nodes').elements.some((node) => node.elements[5]?.value === 'value')
					? { nativeControl: true }
					: {}),
				...(structuralPresentation || conditionalRest ? { structural: true } : {}),
				...(conditionalRest ? { conditionalRest: true } : {}),
			},
		});
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
		if (
			selectedExport !== node.id.name &&
			bindingRestSpreads(node, render, null, lexical, filename).hasRest
		) {
			programFor(node, render, null, true);
			return false;
		}
		const structural =
			node.params[0]?.type === 'ObjectPattern' ||
			needsBindingProgram(render, isUnbound) ||
			statements(node).some((statement) => statement.type === 'VariableDeclaration');
		if (structural || (helpers.mount && selectedExport === node.id.name)) {
			const plan = programFor(node, render, selectedExport === node.id.name ? helpers.props : null);
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
		if (plan.hostHandoff)
			replacements.set(node, {
				...mapCow(node, rewritten),
				_octanePresentationHydration: {
					id: plan.id,
					supported: true,
					host: true,
					unboundAttributes: plan.unboundAttributes,
				},
			});
	});
	if (selectedExport !== null) {
		const plan = plans.get(selectedExport);
		if (!plan)
			error(
				filename,
				ast,
				`export ${JSON.stringify(selectedExport)} is not an opted-in static binding view`,
			);
		helpers.collectConstants?.(
			shareableConstants(
				ast,
				[...projectionDependencies(plan, lexical)].filter((name) =>
					lexical.domBindingConstants.has(name),
				),
				lexical,
				imports,
			),
		);
		return projectProgram(ast, plan, filename, lexical);
	}
	if (helpers.collectConstants) {
		const names = new Set();
		for (const fn of new Set(
			[...plans.values()].map((plan) => plan.fn).concat([...programPlans.keys()]),
		)) {
			// Open rest-prop views only need annotations in the ordinary renderer;
			// their authored body still identifies the shared module constants.
			for (const name of projectionDependencies({ values: fn }, lexical)) {
				if (lexical.domBindingConstants.has(name)) names.add(name);
			}
		}
		helpers.collectConstants(shareableConstants(ast, [...names], lexical, imports));
	}
	return lowerAdoptions(mapCow(ast, replacements), filename);
}
