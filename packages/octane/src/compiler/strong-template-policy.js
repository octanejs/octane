import { createLexicalAnalysis } from './compile-universal.js';
import {
	checkStrongHTMLValue,
	strongHTMLSpreadWriter,
	STRONG_UNTRUSTED_HTML,
	STRONG_HTML_MESSAGE,
} from './strong-html.js';
import { analyzeRendererBoundaries } from './renderer-boundaries.js';

const COMPAT_EXPORTS = new Set(['flushSync', 'unstable_batchedUpdates', 'StrictMode']);
const SUPPRESSION_PROPS = new Set(['suppressHydrationWarning', 'suppressNativeChangeWarning']);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
const SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);

// These checks share the Strong visitor's lexical bindings. The policy itself
// never annotates the parser tree or changes the output of valid programs.
export function createStrongTemplatePolicy({
	ast,
	report,
	resolve,
	unwrap,
	callableValue,
	staticPrimitiveValue,
	source,
	filename,
	options,
}) {
	const pending = [];
	const seen = new WeakMap();
	const jsxReturns = new WeakMap();
	// The factory check only fires for an Octane createElement call whose props
	// name the HTML key (or spell it with an escape), so both texts must appear.
	const mayHaveHTML =
		source.includes('createElement') &&
		(source.includes('dangerouslySetInnerHTML') || source.includes('\\'));
	let keyDepth = 0;
	let regions;
	function add(code, node, message) {
		let codes = seen.get(node);
		if (codes?.has(code)) return;
		if (!codes) seen.set(node, (codes = new Set()));
		codes.add(code);
		pending.push({ code, node, message });
	}
	function domAt(node) {
		let renderer = options.renderer?.id ?? 'dom';
		if (options.rendererBoundaries && regions === undefined) {
			// Reuse the module's parsed tree: a second parse would reject shapes the
			// tolerant editor parser accepts and would throw out of the analysis.
			regions = analyzeRendererBoundaries(source, {
				ast,
				filename,
				rendererBoundaries: options.rendererBoundaries,
			}).boundaries;
		}
		let narrowest = Infinity;
		for (const region of regions ?? []) {
			const range = region.region?.range ?? region.region?.valueRange;
			if (
				!range ||
				node.start < range[0] ||
				node.end > range[1] ||
				range[1] - range[0] >= narrowest
			)
				continue;
			renderer = region.childRenderer;
			narrowest = range[1] - range[0];
		}
		return (
			renderer === 'dom' ||
			options.rendererRegistry?.[renderer]?.target === 'dom' ||
			(renderer === options.renderer?.id && options.renderer.target === 'dom')
		);
	}
	function expressionHasJSX(node, aliasIsJSX) {
		const value = unwrap(node);
		if (!value || FUNCTIONS.has(value.type)) return false;
		if (value.type === 'Identifier' && aliasIsJSX) return aliasIsJSX(value);
		if (
			value.type === 'JSXElement' ||
			value.type === 'JSXFragment' ||
			value.type === 'JSXCodeBlock'
		)
			return true;
		if (value.type === 'ConditionalExpression')
			return (
				expressionHasJSX(value.consequent, aliasIsJSX) ||
				expressionHasJSX(value.alternate, aliasIsJSX)
			);
		if (value.type === 'LogicalExpression')
			return expressionHasJSX(value.left, aliasIsJSX) || expressionHasJSX(value.right, aliasIsJSX);
		if (value.type === 'SequenceExpression')
			return expressionHasJSX(value.expressions.at(-1), aliasIsJSX);
		if (value.type === 'ArrayExpression')
			return value.elements.some((element) => expressionHasJSX(element, aliasIsJSX));
		return false;
	}
	function returnsJSX(fn) {
		if (jsxReturns.has(fn)) return jsxReturns.get(fn);
		const constants = [];
		const returnValues = [];
		function returned(value) {
			if (!value || typeof value !== 'object') return false;
			if (Array.isArray(value)) return value.some(returned);
			if (
				FUNCTIONS.has(value.type) ||
				value.type === 'ClassDeclaration' ||
				value.type === 'ClassExpression'
			)
				return false;
			if (value.type === 'ReturnStatement') {
				returnValues.push(value.argument);
				return expressionHasJSX(value.argument);
			}
			if (value.type === 'VariableDeclaration' && value.kind === 'const')
				constants.push(...value.declarations);
			for (const key in value)
				if (!SKIP_KEYS.has(key) && !key.startsWith('_octane') && returned(value[key])) return true;
			return false;
		}
		let result = fn.body.type === 'BlockStatement' ? returned(fn.body) : expressionHasJSX(fn.body);
		// Resolve local const aliases only when a mapper contains a JSX-valued
		// initializer. Ordinary data maps pay no additional lexical analysis.
		if (!result && constants.some((declaration) => expressionHasJSX(declaration.init))) {
			const lexical = createLexicalAnalysis(fn);
			const values = new Map();
			for (const declaration of constants) {
				if (declaration.id.type !== 'Identifier') continue;
				const owner = lexical.resolveBinding(
					lexical.nodeScopes.get(declaration.id),
					declaration.id.name,
				)?.scope;
				if (!owner) continue;
				let bindings = values.get(owner);
				if (!bindings) values.set(owner, (bindings = new Map()));
				bindings.set(declaration.id.name, declaration.init);
			}
			const active = new Set();
			function aliasIsJSX(identifier) {
				const owner = lexical.resolveBinding(
					lexical.nodeScopes.get(identifier),
					identifier.name,
				)?.scope;
				const initializer = values.get(owner)?.get(identifier.name);
				if (!initializer || active.has(initializer)) return false;
				active.add(initializer);
				const found = expressionHasJSX(initializer, aliasIsJSX);
				active.delete(initializer);
				return found;
			}
			result = returnValues.some((value) => expressionHasJSX(value, aliasIsJSX));
		}
		jsxReturns.set(fn, result);
		return result;
	}
	function callbackReturnsJSX(callback) {
		if (callback?.kind === 'callback') return returnsJSX(callback.node);
		return callback?.kind === 'callback-choice' && callback.values.some(callbackReturnsJSX);
	}
	function suppression(name, node) {
		if (SUPPRESSION_PROPS.has(name))
			add(
				'OCTANE_STRONG_SUPPRESSION_PROP',
				node,
				`Remove \`${name}\` in Strong mode. Fix the hydration mismatch or use native per-edit \`onInput\` handling instead of suppressing the diagnostic.`,
			);
	}
	function spreadSuppressions(expression, scope) {
		const value = unwrap(expression);
		if (value?.type === 'ObjectExpression') {
			for (const property of value.properties) {
				if (property.type === 'SpreadElement') spreadSuppressions(property.argument, scope);
				else
					suppression(
						property.computed
							? staticPrimitiveValue(property.key, scope)
							: (property.key.name ?? property.key.value),
						property.key,
					);
			}
		} else if (value?.type === 'ConditionalExpression') {
			spreadSuppressions(value.consequent, scope);
			spreadSuppressions(value.alternate, scope);
		}
	}
	function visit(node, scope, reference = true) {
		if (
			node.type === 'ImportDeclaration' &&
			node.source?.value === 'octane' &&
			node.importKind !== 'type'
		) {
			for (const specifier of node.specifiers ?? []) {
				const name = specifier.imported?.name ?? specifier.imported?.value;
				if (specifier.importKind !== 'type' && COMPAT_EXPORTS.has(name))
					add(
						'OCTANE_STRONG_COMPAT_IMPORT',
						specifier,
						`\`${name}\` is a compatibility API. Strong mode uses Octane's normal scheduling and component semantics; remove this import.`,
					);
			}
		} else if (node.type === 'VariableDeclaration') {
			for (const declaration of node.declarations) {
				const value = unwrap(declaration.init);
				if (
					declaration.id.type !== 'ObjectPattern' ||
					value?.type !== 'Identifier' ||
					resolve(scope, value.name)?.kind !== 'namespace'
				)
					continue;
				for (const property of declaration.id.properties) {
					if (property.type !== 'Property') continue;
					const name = property.computed
						? staticPrimitiveValue(property.key, scope)
						: (property.key.name ?? property.key.value);
					if (COMPAT_EXPORTS.has(name))
						add(
							'OCTANE_STRONG_COMPAT_IMPORT',
							property.key,
							`\`${name}\` is a compatibility API. Remove this access in Strong mode.`,
						);
				}
			}
		} else if (node.type === 'MemberExpression') {
			const object = unwrap(node.object);
			const name = node.computed ? staticPrimitiveValue(node.property, scope) : node.property?.name;
			if (
				object?.type === 'Identifier' &&
				resolve(scope, object.name)?.kind === 'namespace' &&
				COMPAT_EXPORTS.has(name)
			)
				add(
					'OCTANE_STRONG_COMPAT_IMPORT',
					node,
					`\`${name}\` is a compatibility API. Remove this access in Strong mode.`,
				);
		} else if (node.type === 'CallExpression') {
			const callee = unwrap(node.callee);
			const calleeBinding =
				mayHaveHTML && callee?.type === 'Identifier' ? resolve(scope, callee.name) : null;
			const receiver = callee?.type === 'MemberExpression' ? unwrap(callee.object) : null;
			const name =
				callee?.type === 'MemberExpression'
					? callee.computed
						? staticPrimitiveValue(callee.property, scope)
						: callee.property?.name
					: null;
			const isElementFactory =
				mayHaveHTML &&
				((calleeBinding?.kind === 'hook' && calleeBinding.hook === 'createElement') ||
					(name === 'createElement' &&
						receiver?.type === 'Identifier' &&
						resolve(scope, receiver.name)?.kind === 'namespace'));
			if (
				isElementFactory &&
				typeof staticPrimitiveValue(node.arguments[0], scope) === 'string' &&
				domAt(node)
			) {
				checkStrongHTMLValue(strongHTMLSpreadWriter(node.arguments[1]), (value) =>
					add(STRONG_UNTRUSTED_HTML, value, STRONG_HTML_MESSAGE),
				);
			}
			if (
				callee?.type === 'MemberExpression' &&
				name === 'map' &&
				callbackReturnsJSX(callableValue(node.arguments?.[0], scope))
			)
				add(
					'OCTANE_STRONG_MAP_JSX',
					node,
					'Use a keyed `@for` block to render a list instead of `.map()` returning JSX. Choose a stable item identity for its key.',
				);
		} else if (node.type === 'JSXOpeningElement') {
			let root = node.name;
			let member = null;
			while (root?.type === 'JSXMemberExpression') {
				member = root;
				root = root.object;
			}
			if (
				member &&
				root?.type === 'JSXIdentifier' &&
				resolve(scope, root.name)?.kind === 'namespace' &&
				COMPAT_EXPORTS.has(member.property.name)
			)
				add(
					'OCTANE_STRONG_COMPAT_IMPORT',
					member,
					`\`${member.property.name}\` is a compatibility API. Remove this access in Strong mode.`,
				);
			if (node.name?.type !== 'JSXIdentifier' || !/^[a-z]/.test(node.name.name) || !domAt(node))
				return;
			for (const attribute of node.attributes ?? []) {
				if (attribute.type === 'JSXSpreadAttribute') spreadSuppressions(attribute.argument, scope);
				else suppression(attribute.name?.name, attribute.name);
			}
		} else if (
			keyDepth > 0 &&
			reference &&
			node.type === 'Identifier' &&
			resolve(scope, node.name)?.strongIndex === true
		) {
			add(
				'OCTANE_STRONG_INDEX_KEY',
				node,
				'An `@for` key must identify the item independently of its position. Use a stable item ID instead of the loop index.',
			);
		}
	}
	return {
		visit,
		enterKey() {
			keyDepth++;
		},
		exitKey() {
			keyDepth--;
		},
		finish() {
			for (const { code, node, message } of pending) report(code, node, message);
		},
	};
}
