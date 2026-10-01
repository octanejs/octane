import { ATTRIBUTE_ALIASES } from '../dom-tables.js';
import { analyzeStrongHookBindings } from './hook-deps.js';
import { createRendererRegionResolver } from './renderer-boundaries.js';

export const STRONG_MANAGED_DOM_WRITE = 'OCTANE_STRONG_MANAGED_DOM_WRITE';
export const STRONG_RAW_HTML_WRITE = 'OCTANE_STRONG_RAW_HTML_WRITE';
export const STRONG_OWN_MARKUP_QUERY = 'OCTANE_STRONG_OWN_MARKUP_QUERY';

const SKIP_KEYS = new Set([
	'type',
	'start',
	'end',
	'loc',
	'range',
	'parent',
	'metadata',
	'comments',
	'tokens',
	'typeAnnotation',
	'returnType',
	'typeParameters',
	'typeArguments',
]);
const TRANSPARENT = new Set([
	'ChainExpression',
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
// Writes that replace the child list the template renders.
const CHILD_PROPERTIES = new Set(['textContent', 'innerText']);
const CHILD_METHODS = new Set([
	'append',
	'appendChild',
	'insertBefore',
	'prepend',
	'removeChild',
	'replaceChild',
	'replaceChildren',
]);
// Raw markup bypasses the TrustedHTML boundary whether or not there are children.
const RAW_HTML_PROPERTIES = new Set(['innerHTML', 'outerHTML']);
const RAW_HTML_METHODS = new Set(['insertAdjacentHTML', 'setHTMLUnsafe']);
const CLASS_LIST_MUTATORS = new Set(['add', 'remove', 'replace', 'toggle']);
const ATTRIBUTE_METHODS = new Set(['setAttribute', 'removeAttribute', 'toggleAttribute']);
const STYLE_METHODS = new Set(['setProperty', 'removeProperty']);
const QUERY_METHODS = new Set([
	'getElementById',
	'getElementsByClassName',
	'querySelector',
	'querySelectorAll',
]);
// Props that never become attributes the element owns.
const NON_ATTRIBUTE_PROPS = new Set([
	'key',
	'ref',
	'children',
	'dangerouslySetInnerHTML',
	'defaultValue',
	'defaultChecked',
	'suppressHydrationWarning',
	'suppressNativeChangeWarning',
]);
const WRITE_NAMES = [
	...CHILD_PROPERTIES,
	...CHILD_METHODS,
	...RAW_HTML_PROPERTIES,
	...RAW_HTML_METHODS,
	'className',
	'classList',
	...ATTRIBUTE_METHODS,
	'style',
];
// A selector with one optional tag and at least one #id/.class part. Combinators,
// attribute selectors, pseudo-classes and CSS escapes are not proven.
const COMPOUND_SELECTOR = /^([a-zA-Z][\w-]*)?((?:[#.][a-zA-Z_-][\w-]*)+)$/;

const MANAGED_MESSAGE_END =
	'Keep refs for reading, focus, measurement, and DOM the template does not render.';

// Every checked write reaches an element through a `ref={…}` prop, and every
// checked query names a document method. Unicode, hex and identity escapes or
// line continuations can spell those names without their plain text.
const ESCAPED_NAME = /\\(?:[ux]|[ac-eg-mo-qswyzA-Z]|[\r\n\u2028\u2029])/;
// `ref={…}`, or the TSRX attribute shorthand `{ref}`.
const REF_PROP = /\bref\s*=\s*\{|\{\s*ref\s*\}/;
const WRITE_ACCESS = new RegExp(`(?:\\.|\\[\\s*['"\`])\\s*(?:${WRITE_NAMES.join('|')})\\b`);
const QUERY_METHOD = /\b(?:getElementById|getElementsByClassName|querySelector)/;

function mayWrite(text) {
	return REF_PROP.test(text) && WRITE_ACCESS.test(text);
}

export function mayHaveStrongDOM(source) {
	return (
		ESCAPED_NAME.test(source) ||
		mayWrite(source) ||
		(source.includes('document') && QUERY_METHOD.test(source))
	);
}

function unwrap(node) {
	while (node && TRANSPARENT.has(node.type)) node = node.expression;
	return node;
}

function resolveBinding(scope, name) {
	for (let current = scope; current; current = current.parent) {
		const binding = current.bindings.get(name);
		if (binding !== undefined) return binding;
	}
	return null;
}

function staticString(node) {
	const value = unwrap(node);
	if (value?.type === 'Literal' && typeof value.value === 'string') return value.value;
	if (value?.type === 'TemplateLiteral' && value.expressions.length === 0) {
		return value.quasis[0]?.value?.cooked ?? null;
	}
	return null;
}

function propertyName(member) {
	if (!member.computed) return member.property?.type === 'Identifier' ? member.property.name : null;
	const value = unwrap(member.property);
	if (value?.type === 'Literal' && typeof value.value === 'number') return String(value.value);
	return staticString(value);
}

function attributeName(attribute) {
	const name = attribute.name;
	if (name?.type === 'JSXIdentifier') return name.name;
	if (name?.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
	return null;
}

// The template spells styles in camelCase; the DOM also accepts kebab-case.
function styleKey(name) {
	if (name.startsWith('--')) return name;
	const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).toLowerCase();
	if (kebab === 'css-float') return 'float';
	return kebab.startsWith('ms-') ? `-${kebab}` : kebab;
}

function styleKeys(value) {
	const keys = new Set();
	const text = staticString(value?.type === 'JSXExpressionContainer' ? value.expression : value);
	if (text !== null) {
		for (const declaration of text.split(';')) {
			const colon = declaration.indexOf(':');
			if (colon > 0) keys.add(styleKey(declaration.slice(0, colon).trim()));
		}
		return keys;
	}
	const object = value?.type === 'JSXExpressionContainer' ? unwrap(value.expression) : null;
	for (const property of object?.type === 'ObjectExpression' ? object.properties : []) {
		// A spread may add more keys; the literal keys remain template-owned.
		if (property.type !== 'Property') continue;
		const key = property.computed
			? staticString(property.key)
			: (property.key?.name ??
				(typeof property.key?.value === 'string' ? property.key.value : null));
		if (key) keys.add(styleKey(key));
	}
	return keys;
}

function literalClasses(value) {
	const expression = value?.type === 'JSXExpressionContainer' ? unwrap(value.expression) : value;
	const classes = new Set();
	const text = staticString(expression);
	if (text !== null) {
		for (const name of text.split(/\s+/)) if (name) classes.add(name);
	} else if (expression?.type === 'ArrayExpression') {
		// Octane composes class arrays clsx-style; a string element is always present.
		for (const element of expression.elements) {
			const part = staticString(element);
			if (part !== null) for (const name of part.split(/\s+/)) if (name) classes.add(name);
		}
	}
	return classes;
}

// JSX drops whitespace-only text that contains a line break.
// Literal normalization leaves '' for text it removed, which renders nothing.
function rendersChild(child) {
	if (child.type === 'JSXText') {
		return child.value !== '' && (!/^\s*$/.test(child.value) || !/[\r\n]/.test(child.value));
	}
	if (child.type === 'JSXExpressionContainer')
		return child.expression?.type !== 'JSXEmptyExpression';
	// Sibling-scoped <style> is extracted from the template, not rendered here.
	return child.type !== 'JSXStyleElement';
}

function parseSelector(method, text) {
	if (method === 'getElementById') return text ? { tag: null, id: text, classes: [] } : null;
	if (method === 'getElementsByClassName') {
		const classes = text.split(/\s+/).filter(Boolean);
		return classes.length ? { tag: null, id: null, classes } : null;
	}
	const match = COMPOUND_SELECTOR.exec(text.trim());
	if (match === null) return null;
	const parts = match[2].match(/[#.][^#.]+/g);
	const ids = parts.filter((part) => part[0] === '#').map((part) => part.slice(1));
	if (ids.length > 1) return null;
	return {
		tag: match[1]?.toLowerCase() ?? null,
		id: ids[0] ?? null,
		classes: parts.filter((part) => part[0] === '.').map((part) => part.slice(1)),
	};
}

function selectorText(selector) {
	return `${selector.tag ?? ''}${selector.id === null ? '' : `#${selector.id}`}${selector.classes
		.map((name) => `.${name}`)
		.join('')}`;
}

/**
 * Strong DOM ownership checks. A ref proves which rendered intrinsic element it
 * names only when its binding is used solely as that one element's `ref` prop and
 * through `.current` reads; any other use (a component ref prop, a helper call, a
 * `.current` write) withdraws the proof. Queries prove their target only through
 * a literal selector and a literal id or class rendered by the same component.
 * This pass never annotates the parser tree or changes emitted code.
 */
export function analyzeStrongDOM(ast, source, filename, options = {}) {
	if (!mayHaveStrongDOM(source)) return [];
	const { analysis, callNames } =
		options.strongHookAnalysis ?? analyzeStrongHookBindings(ast, options);
	const isDOM =
		options.rendererRegionResolver ?? createRendererRegionResolver(ast, source, filename, options);
	const nodeScopes = analysis.nodeScopes;
	const diagnostics = [];
	const reported = new WeakSet();
	const refs = new Map();
	const refDeclarators = new Map();
	const declarations = new Map();
	for (const { decl, bindings, kind } of analysis.declarators) {
		if (kind === 'var') continue;
		for (const { pattern, binding } of bindings) {
			if (binding.reassigned) continue;
			if (pattern === decl.id) {
				declarations.set(binding, { init: decl.init, current: false });
				const init = unwrap(decl.init);
				if (init?.type === 'CallExpression' && callNames.get(init) === 'useRef') {
					const record = { boundary: undefined, attachments: [], escaped: false };
					refs.set(binding, record);
					refDeclarators.set(decl, record);
				}
			} else if (decl.id.type === 'ObjectPattern') {
				// `const { current: element } = ref` reads the same value as `ref.current`.
				const property = decl.id.properties.find((entry) => entry.value === pattern);
				if (
					property?.type === 'Property' &&
					(property.computed ? staticString(property.key) : property.key?.name) === 'current'
				) {
					declarations.set(binding, { init: decl.init, current: true });
				}
			}
		}
	}
	const elementParameters = new Map();
	const elements = [];
	const writes = [];
	const queries = [];
	const boundaries = [];
	const functions = [];
	// TSRX row and catch bindings are not scopes in the shared hook analysis.
	const templateNames = [];

	function templateShadowed(name) {
		for (const names of templateNames) if (names.has(name)) return true;
		return false;
	}

	function bindingOf(identifier) {
		if (templateShadowed(identifier.name)) return undefined;
		const scope = nodeScopes.get(identifier);
		return scope === undefined ? undefined : resolveBinding(scope, identifier.name);
	}

	function refOf(expression) {
		const value = unwrap(expression);
		if (value?.type !== 'Identifier') return null;
		const binding = bindingOf(value);
		if (binding === undefined) {
			// Unscoped syntax cannot prove which binding a spelling names.
			for (const [candidate, record] of refs)
				if (candidate.name === value.name) record.escaped = true;
			return null;
		}
		return refs.get(binding) ?? null;
	}

	function refCurrent(expression) {
		const value = unwrap(expression);
		if (value?.type !== 'MemberExpression' || propertyName(value) !== 'current') return null;
		return refOf(value.object);
	}

	// Resolve an element value: `ref.current`, a callback-ref parameter, or an
	// unreassigned local alias of either.
	const aliasSources = new Map();
	function elementSource(expression, depth = 0) {
		const value = unwrap(expression);
		const ref = refCurrent(value);
		if (ref !== null) return { ref };
		if (value?.type !== 'Identifier' || depth > 16) return null;
		const binding = bindingOf(value);
		if (!binding) return null;
		const parameter = elementParameters.get(binding);
		if (parameter !== undefined) return { element: parameter };
		if (aliasSources.has(binding)) return aliasSources.get(binding);
		aliasSources.set(binding, null);
		const declaration = declarations.get(binding);
		let result = null;
		if (declaration?.current) {
			const ref = refOf(declaration.init);
			result = ref === null ? null : { ref };
		} else if (declaration) {
			result = elementSource(declaration.init, depth + 1);
		}
		aliasSources.set(binding, result);
		return result;
	}

	// Peel property accesses outward from an element value: `ref.current.style.color`
	// is the element followed by the path ['style', 'color'].
	function elementAccess(expression) {
		const path = [];
		let value = unwrap(expression);
		while (value) {
			const source = elementSource(value);
			if (source !== null) return { source, path: path.reverse() };
			if (value.type !== 'MemberExpression') return null;
			const name = propertyName(value);
			if (name === null) return null;
			path.push(name);
			value = unwrap(value.object);
		}
		return null;
	}

	function documentValue(expression, depth = 0) {
		const value = unwrap(expression);
		if (value?.type === 'Identifier') {
			const binding = bindingOf(value);
			if (binding === null) return value.name === 'document';
			if (!binding || depth > 16) return false;
			const declaration = declarations.get(binding);
			return declaration !== undefined && !declaration.current
				? documentValue(declaration.init, depth + 1)
				: false;
		}
		if (value?.type !== 'MemberExpression' || propertyName(value) !== 'document') return false;
		const object = unwrap(value.object);
		return (
			object?.type === 'Identifier' &&
			(object.name === 'window' || object.name === 'globalThis') &&
			bindingOf(object) === null
		);
	}

	function recordElement(node) {
		const opening = node.openingElement;
		const tag = opening.name.name;
		const element = {
			node,
			tag: tag.toLowerCase(),
			attributes: new Set(),
			styleKeys: null,
			classes: new Set(),
			id: null,
			children: (node.children ?? []).some(rendersChild),
			boundary: boundaries.at(-1),
			root: functions[0],
		};
		for (const attribute of opening.attributes) {
			if (attribute.type !== 'JSXAttribute') continue;
			const raw = attributeName(attribute);
			if (raw === null) continue;
			if (raw === 'children' || raw === 'dangerouslySetInnerHTML') element.children = true;
			if (NON_ATTRIBUTE_PROPS.has(raw) || /^on[A-Z]/.test(raw)) continue;
			const name = (
				raw === 'className'
					? 'class'
					: tag.includes('-')
						? raw
						: (ATTRIBUTE_ALIASES.get(raw) ?? raw)
			).toLowerCase();
			element.attributes.add(name);
			if (name === 'style') element.styleKeys = styleKeys(attribute.value);
			if (name === 'class')
				for (const value of literalClasses(attribute.value)) element.classes.add(value);
			if (name === 'id') {
				element.id = staticString(
					attribute.value?.type === 'JSXExpressionContainer'
						? attribute.value.expression
						: attribute.value,
				);
			}
		}
		elements.push(element);
		return element;
	}

	function attachRefs(expression, element) {
		const value = unwrap(expression);
		if (value?.type === 'ArrayExpression') {
			for (const entry of value.elements) if (entry && !attachRefs(entry, element)) visit(entry);
			return true;
		}
		if (FUNCTIONS.has(value?.type)) {
			const parameter = value.params[0];
			const scope = analysis.functionScopes.get(value);
			const binding =
				parameter?.type === 'Identifier' && scope ? scope.bindings.get(parameter.name) : null;
			if (binding && !binding.reassigned) elementParameters.set(binding, element);
			visit(value);
			return true;
		}
		if (value?.type !== 'Identifier') return false;
		const ref = refOf(value);
		if (ref === null) return false;
		ref.attachments.push(element);
		return true;
	}

	function visitPattern(pattern) {
		if (!pattern || typeof pattern !== 'object') return;
		switch (pattern.type) {
			case 'AssignmentPattern':
				visitPattern(pattern.left);
				visit(pattern.right);
				return;
			case 'ArrayPattern':
				for (const element of pattern.elements) visitPattern(element);
				return;
			case 'ObjectPattern':
				for (const property of pattern.properties) {
					if (property.type === 'RestElement') visitPattern(property.argument);
					else {
						if (property.computed) visit(property.key);
						visitPattern(property.value);
					}
				}
				return;
			case 'RestElement':
				visitPattern(pattern.argument);
				return;
			case 'TSParameterProperty':
				visitPattern(pattern.parameter);
				return;
			case 'Identifier':
				return;
			default:
				// Assignment targets such as `ref.current` in a destructuring write.
				visitWriteTarget(pattern);
		}
	}

	// A write through `ref.current` itself retargets the ref.
	function visitWriteTarget(target) {
		const ref = refCurrent(target);
		if (ref !== null) {
			ref.escaped = true;
			return;
		}
		visit(target);
	}

	function patternNames(pattern, names) {
		if (!pattern) return names;
		if (pattern.type === 'Identifier') names.add(pattern.name);
		else if (pattern.type === 'VariableDeclaration')
			for (const declaration of pattern.declarations) patternNames(declaration.id, names);
		else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, names);
		else if (pattern.type === 'RestElement') patternNames(pattern.argument, names);
		else if (pattern.type === 'ArrayPattern')
			for (const element of pattern.elements) patternNames(element, names);
		else if (pattern.type === 'ObjectPattern')
			for (const property of pattern.properties)
				patternNames(property.type === 'RestElement' ? property.argument : property.value, names);
		return names;
	}

	function visit(node) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type?.startsWith('TS') && !TRANSPARENT.has(node.type)) return;
		switch (node.type) {
			case 'Identifier': {
				const binding = bindingOf(node);
				const ref = binding ? refs.get(binding) : undefined;
				if (ref !== undefined) ref.escaped = true;
				else if (binding === undefined) refOf(node);
				return;
			}
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				boundaries.push(node);
				functions.push(node);
				try {
					for (const parameter of node.params) visitPattern(parameter);
					visit(node.body);
				} finally {
					boundaries.pop();
					functions.pop();
				}
				return;
			case 'VariableDeclarator': {
				const record = refDeclarators.get(node);
				if (record !== undefined) record.boundary = boundaries.at(-1);
				visitPattern(node.id);
				// `const { current: element } = ref` reads `.current` and nothing else.
				if (
					node.id.type === 'ObjectPattern' &&
					node.id.properties.length > 0 &&
					node.id.properties.every(
						(property) =>
							property.type === 'Property' &&
							(property.computed ? staticString(property.key) : property.key?.name) === 'current',
					) &&
					refOf(node.init) !== null
				) {
					return;
				}
				visit(node.init);
				return;
			}
			case 'CatchClause':
				visitPattern(node.param);
				visit(node.body);
				return;
			case 'JSXForExpression': {
				visit(node.right);
				boundaries.push(node);
				templateNames.push(patternNames(node.index, patternNames(node.left, new Set())));
				try {
					if (node.left?.type === 'VariableDeclaration') visit(node.left);
					else visitPattern(node.left);
					visit(node.key);
					visit(node.body);
				} finally {
					templateNames.pop();
					boundaries.pop();
				}
				visit(node.empty);
				return;
			}
			case 'JSXTryExpression':
				visit(node.block);
				visit(node.pending);
				if (node.handler) {
					templateNames.push(
						patternNames(node.handler.resetParam, patternNames(node.handler.param, new Set())),
					);
					try {
						visit(node.handler.body);
					} finally {
						templateNames.pop();
					}
				}
				return;
			case 'JSXElement': {
				const opening = node.openingElement;
				const element =
					opening.name?.type === 'JSXIdentifier' &&
					/^[a-z]/.test(opening.name.name) &&
					isDOM(opening)
						? recordElement(node)
						: null;
				for (const attribute of opening.attributes) {
					if (
						element !== null &&
						attribute.type === 'JSXAttribute' &&
						attributeName(attribute) === 'ref' &&
						attribute.value?.type === 'JSXExpressionContainer' &&
						attachRefs(attribute.value.expression, element)
					) {
						continue;
					}
					visit(attribute);
				}
				visit(node.children);
				return;
			}
			case 'JSXAttribute':
				visit(node.value);
				return;
			case 'JSXOpeningElement':
			case 'JSXClosingElement':
			case 'JSXIdentifier':
			case 'JSXMemberExpression':
			case 'JSXNamespacedName':
				return;
			case 'Property':
				if (node.computed) visit(node.key);
				visit(node.value);
				return;
			case 'MethodDefinition':
			case 'PropertyDefinition':
			case 'AccessorProperty':
				if (node.computed) visit(node.key);
				visit(node.value);
				return;
			case 'LabeledStatement':
				visit(node.body);
				return;
			case 'BreakStatement':
			case 'ContinueStatement':
				return;
			case 'ImportDeclaration':
			case 'ExportAllDeclaration':
				return;
			case 'ExportNamedDeclaration':
				visit(node.declaration);
				return;
			case 'MemberExpression': {
				if (refCurrent(node) !== null) return;
				visit(node.object);
				if (node.computed) visit(node.property);
				return;
			}
			case 'AssignmentExpression': {
				if (node.left.type === 'ObjectPattern' || node.left.type === 'ArrayPattern') {
					visitPattern(node.left);
				} else {
					recordWrite(node.left, node.left, null);
					visitWriteTarget(node.left);
				}
				visit(node.right);
				return;
			}
			case 'UpdateExpression':
				visitWriteTarget(node.argument);
				return;
			case 'UnaryExpression':
				if (node.operator === 'delete') visitWriteTarget(node.argument);
				else visit(node.argument);
				return;
			case 'ForInStatement':
			case 'ForOfStatement':
				if (node.left.type === 'VariableDeclaration') visit(node.left);
				else visitPattern(node.left);
				visit(node.right);
				visit(node.body);
				return;
			case 'CallExpression': {
				const callee = unwrap(node.callee);
				if (callee?.type === 'MemberExpression') {
					recordWrite(callee, callee, node.arguments);
					const method = propertyName(callee);
					const text = QUERY_METHODS.has(method) ? staticString(node.arguments[0]) : null;
					if (text !== null && documentValue(callee.object)) {
						const selector = parseSelector(method, text);
						if (selector !== null) queries.push({ node, selector, method, root: functions[0] });
					}
				}
				visit(node.callee);
				visit(node.arguments);
				return;
			}
		}
		for (const key in node) {
			if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) visit(node[key]);
		}
	}

	function recordWrite(target, reportNode, args) {
		const access = elementAccess(target);
		if (access === null || access.path.length === 0) return;
		const [first, second] = access.path;
		let kind = null;
		let name = null;
		if (args === null) {
			if (access.path.length === 1 && CHILD_PROPERTIES.has(first)) kind = 'children';
			else if (access.path.length === 1 && RAW_HTML_PROPERTIES.has(first)) kind = 'html';
			else if (access.path.length === 1 && first === 'className') kind = 'class';
			else if (access.path.length === 2 && first === 'classList' && second === 'value')
				kind = 'class';
			else if (first === 'style' && (access.path.length === 1 || second === 'cssText'))
				kind = 'style';
			else if (first === 'style' && access.path.length === 2) {
				kind = 'style-property';
				name = styleKey(second);
			}
		} else if (access.path.length === 1 && CHILD_METHODS.has(first)) {
			kind = 'children';
		} else if (access.path.length === 1 && RAW_HTML_METHODS.has(first)) {
			kind = 'html';
		} else if (access.path.length === 1 && ATTRIBUTE_METHODS.has(first)) {
			name = staticString(args[0])?.toLowerCase() ?? null;
			kind = name === 'class' ? 'class' : name === 'style' ? 'style' : name ? 'attribute' : null;
		} else if (
			access.path.length === 2 &&
			first === 'classList' &&
			CLASS_LIST_MUTATORS.has(second)
		) {
			kind = 'class';
		} else if (access.path.length === 2 && first === 'style' && STYLE_METHODS.has(second)) {
			name = staticString(args[0]);
			if (name !== null) {
				kind = 'style-property';
				name = styleKey(name);
			}
		}
		if (kind !== null) {
			writes.push({ source: access.source, kind, name, node: reportNode, spelling: access.path });
		}
	}

	// Refs, their aliases and a query's markup all belong to one top-level
	// statement's functions, so statements without those spellings are skipped.
	const mayQuery = source.includes('document') || ESCAPED_NAME.test(source);
	for (const statement of ast.body ?? []) {
		const text = source.slice(statement.start, statement.end);
		if (ESCAPED_NAME.test(text) || mayWrite(text) || (mayQuery && QUERY_METHOD.test(text))) {
			visit(statement);
		}
	}

	function report(code, node, message) {
		if (reported.has(node)) return;
		reported.add(node);
		const position = (edge) => ({
			offset: node[edge] ?? 0,
			line: node.loc?.[edge]?.line ?? 1,
			column: node.loc?.[edge]?.column ?? 0,
		});
		diagnostics.push({
			code,
			severity: 'error',
			filename,
			start: position('start'),
			end: position('end'),
			message,
			suggestions: [],
		});
	}

	function provenElement(source) {
		if (source.element) return source.element;
		const ref = source.ref;
		if (ref.escaped || ref.attachments.length !== 1) return null;
		const [element] = ref.attachments;
		return element.boundary === ref.boundary ? element : null;
	}

	for (const write of writes) {
		const element = provenElement(write.source);
		if (element === null) continue;
		const spelling = write.spelling.join('.');
		const tag = `the <${element.tag}>`;
		switch (write.kind) {
			case 'html':
				report(
					STRONG_RAW_HTML_WRITE,
					write.node,
					`Strong mode does not allow \`${spelling}\` on ${tag} that Octane renders. Use \`dangerouslySetInnerHTML={trustHTML(html)}\` on it${element.children ? ' in place of its rendered children' : ''}; trustHTML() marks trusted or already sanitized HTML and does not sanitize it.`,
				);
				break;
			case 'children':
				if (element.children) {
					report(
						STRONG_MANAGED_DOM_WRITE,
						write.node,
						`Strong mode does not allow \`${spelling}\` on ${tag} whose children the template renders; Octane owns that child list. Render the content as its children from state or props. ${MANAGED_MESSAGE_END}`,
					);
				}
				break;
			case 'class':
				if (element.attributes.has('class')) {
					report(
						STRONG_MANAGED_DOM_WRITE,
						write.node,
						`Strong mode does not allow \`${spelling}\` on ${tag} whose class the template sets. Compute the class in the template from state or props, for example \`class={['base', active && 'active']}\`. ${MANAGED_MESSAGE_END}`,
					);
				}
				break;
			case 'style':
				if (element.attributes.has('style')) {
					report(
						STRONG_MANAGED_DOM_WRITE,
						write.node,
						`Strong mode does not allow \`${spelling}\` on ${tag} whose \`style\` prop the template sets. Put the value in the \`style\` prop from state or props. ${MANAGED_MESSAGE_END}`,
					);
				}
				break;
			case 'style-property':
				if (element.styleKeys?.has(write.name)) {
					report(
						STRONG_MANAGED_DOM_WRITE,
						write.node,
						`Strong mode does not allow \`${spelling}\` on ${tag} whose \`style\` prop sets \`${write.name}\`. Put that value in the \`style\` prop from state or props. ${MANAGED_MESSAGE_END}`,
					);
				}
				break;
			case 'attribute':
				if (element.attributes.has(write.name)) {
					report(
						STRONG_MANAGED_DOM_WRITE,
						write.node,
						`Strong mode does not allow \`${spelling}('${write.name}')\` on ${tag} whose \`${write.name}\` the template sets. Pass the value as that prop from state or props. ${MANAGED_MESSAGE_END}`,
					);
				}
				break;
		}
	}

	for (const query of queries) {
		if (query.root === undefined) continue;
		const { selector } = query;
		const match = elements.find(
			(element) =>
				element.root === query.root &&
				(selector.tag === null || selector.tag === element.tag) &&
				(selector.id === null || selector.id === element.id) &&
				selector.classes.every((name) => element.classes.has(name)),
		);
		if (match === undefined) continue;
		report(
			STRONG_OWN_MARKUP_QUERY,
			query.node,
			`Strong mode does not allow \`document.${query.method}()\` to find the \`${selectorText(selector)}\` <${match.tag}> this component renders. Attach a ref instead: \`const element = useRef(null)\`, \`ref={element}\` on the <${match.tag}>, then use \`element.current\` in the effect or event. Portal targets and markup rendered elsewhere stay queryable.`,
		);
	}
	return diagnostics;
}
