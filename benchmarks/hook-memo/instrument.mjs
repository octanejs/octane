// This is a benchmark observer over already-compiled JavaScript, not a compiler
// pass. It deliberately runs after Octane's optimization decisions and the
// clean bundle's tree-shaking. Counters
// therefore cannot turn an otherwise-pure source region into an impure one.
// The observed program is never used for code-size or timing measurements.

const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'metadata', 'comments', 'tokens']);
const DYNAMIC_NAME = Symbol('dynamic inferred function name');

function inferredFunctionName(node, parent, key) {
	if (node.type === 'FunctionExpression' && node.id != null) return null;
	if (parent?.type === 'VariableDeclarator' && key === 'init' && parent.id?.type === 'Identifier') {
		return parent.id.name;
	}
	if (
		parent?.type === 'AssignmentExpression' &&
		key === 'right' &&
		['=', '||=', '&&=', '??='].includes(parent.operator) &&
		parent.left?.type === 'Identifier'
	) {
		return parent.left.name;
	}
	if (
		parent?.type === 'AssignmentPattern' &&
		key === 'right' &&
		parent.left?.type === 'Identifier'
	) {
		return parent.left.name;
	}
	if (parent?.type === 'ExportDefaultDeclaration' && key === 'declaration') return 'default';
	if ((parent?.type === 'Property' || parent?.type === 'PropertyDefinition') && key === 'value') {
		if (!parent.computed && parent.key?.type === 'Identifier') return parent.key.name;
		if (!parent.computed && parent.key?.type === 'PrivateIdentifier') return '#' + parent.key.name;
		if (
			parent.key?.type === 'Literal' &&
			['string', 'number', 'bigint'].includes(typeof parent.key.value)
		) {
			return String(parent.key.value);
		}
		return DYNAMIC_NAME;
	}
	return null;
}

export const COUNTER_KINDS = ['functions', 'arrayLiterals', 'arrayConstructors', 'restArrays'];
export const COUNTER_GLOBAL = '__octaneHookMemoAllocations';

export function emptyCounters() {
	return Object.fromEntries(
		['application', 'runtime'].flatMap((owner) =>
			COUNTER_KINDS.map((kind) => [`${owner}_${kind}`, 0]),
		),
	);
}

export function instrumentJavaScript(source, filename, owner, { parseModule, builders, print }) {
	const b = builders;
	const increment = (siteOwner, kind) =>
		b.update('++', b.member(b.member(b.id('globalThis'), COUNTER_GLOBAL), `${siteOwner}_${kind}`));

	function visit(node, parent = null, parentKey = null) {
		if (Array.isArray(node)) return node.map((child) => visit(child, parent, parentKey));
		if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return node;
		let rewritten = node;
		for (const key of Object.keys(node)) {
			if (SKIP_KEYS.has(key)) continue;
			const child = node[key];
			if (child === null || typeof child !== 'object') continue;
			const next = visit(child, node, key);
			if (next === child) continue;
			if (rewritten === node) rewritten = { ...node };
			rewritten[key] = next;
		}
		const siteOwner = typeof owner === 'function' ? owner(node) : owner;
		if (siteOwner === null || siteOwner === undefined) return rewritten;

		if (
			FUNCTION_TYPES.has(node.type) &&
			node.params?.some((param) => param.type === 'RestElement')
		) {
			const counter = increment(siteOwner, 'restArrays');
			const body = rewritten.body;
			rewritten = {
				...rewritten,
				body:
					body.type === 'BlockStatement'
						? { ...body, body: [b.stmt(counter), ...body.body] }
						: b.sequence([counter, body]),
			};
		}

		const methodValue =
			parentKey === 'value' &&
			(parent?.type === 'MethodDefinition' ||
				(parent?.type === 'Property' &&
					(parent.method || parent.kind === 'get' || parent.kind === 'set')));
		if (
			node.type === 'ArrowFunctionExpression' ||
			(node.type === 'FunctionExpression' && !methodValue)
		) {
			const inferredName = inferredFunctionName(node, parent, parentKey);
			// Re-evaluating a computed name could have side effects. Those rare
			// naming contexts stay unobserved rather than changing the program.
			if (inferredName === DYNAMIC_NAME) return rewritten;
			// A comma wrapper suppresses NamedEvaluation. A static computed property
			// gives the original anonymous function its exact inferred name without
			// altering its lexical this/arguments/super environment. This observer-
			// owned object is not a source allocation and is never timed.
			const value =
				inferredName === null
					? rewritten
					: b.member(
							b.object([b.prop('init', b.literal(inferredName), rewritten, true)]),
							b.literal(inferredName),
							true,
						);
			return b.sequence([increment(siteOwner, 'functions'), value]);
		}
		if (node.type === 'ArrayExpression') {
			return b.sequence([increment(siteOwner, 'arrayLiterals'), rewritten]);
		}
		if (
			node.type === 'NewExpression' &&
			node.callee?.type === 'Identifier' &&
			node.callee.name === 'Array'
		) {
			return b.sequence([increment(siteOwner, 'arrayConstructors'), rewritten]);
		}
		return rewritten;
	}

	return print(visit(parseModule(source, filename)));
}
