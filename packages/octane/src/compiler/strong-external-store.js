// useSyncExternalStore compares snapshots with Object.is. A getSnapshot that
// allocates a new object on every call therefore looks like a store change on
// every read: development warns once, then commit-time store checks re-render
// until the update-depth limit throws. This read-only source check reports
// only returns that provably allocate, using the shared Strong hook graph.

export const STRONG_UNCACHED_STORE_SNAPSHOT = 'OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const TRANSPARENT = new Set([
	'ChainExpression',
	'ParenthesizedExpression',
	'TSAsExpression',
	'TSInstantiationExpression',
	'TSNonNullExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);
const SKIP_KEYS = new Set(['type', 'start', 'end', 'loc', 'range', 'parent', 'metadata']);
// Methods that always return a new array (or array-like) and that strings do
// not have, so a primitive result is impossible.
const COPY_METHODS = new Set([
	'map',
	'filter',
	'flat',
	'flatMap',
	'toSorted',
	'toReversed',
	'toSpliced',
]);
const FRESH_STATICS = new Map([
	['Object', new Set(['keys', 'values', 'entries', 'fromEntries', 'getOwnPropertyNames'])],
	['Array', new Set(['from', 'of'])],
]);
const FRESH_CONSTRUCTORS = new Set([
	'Array',
	'Date',
	'Map',
	'Object',
	'RegExp',
	'Set',
	'URL',
	'URLSearchParams',
]);
const MESSAGE =
	'Strong mode does not allow a useSyncExternalStore getSnapshot or getServerSnapshot that returns a new object or array on every call. Octane compares snapshots with Object.is, so every read looks like a store change: development warns, then renders repeat until the update-depth limit throws. Return a value the store keeps, such as its current state object, or read each field with its own useSyncExternalStore call.';

function unwrap(node) {
	let value = node;
	while (value && TRANSPARENT.has(value.type)) value = value.expression;
	return value;
}

function resolveBinding(scope, name) {
	for (let current = scope; current != null; current = current.parent) {
		const binding = current.bindings.get(name);
		if (binding !== undefined) return binding;
	}
	return null;
}

function propertyName(member) {
	const property = unwrap(member.property);
	if (member.computed) return property?.type === 'Literal' ? property.value : null;
	return property?.type === 'Identifier' ? property.name : null;
}

/**
 * @param {any} ast
 * @param {{ analysis: any, callNames: Map<any, string> }} strongHookAnalysis
 * @param {(code: string, node: any, message: string) => any} diagnostic
 */
export function analyzeStrongExternalStore(ast, strongHookAnalysis, diagnostic) {
	const { analysis, callNames } = strongHookAnalysis;
	let calls = null;
	for (const { call } of analysis.calls) {
		if (callNames.get(call) === 'useSyncExternalStore') (calls ??= []).push(call);
	}
	if (calls === null) return [];

	const functions = new Map();
	for (const record of analysis.functions) {
		if (record.binding && record.stableDefinition) functions.set(record.binding, record.node);
	}
	const constants = new Map();
	for (const { decl, bindings, kind } of analysis.declarators) {
		if (kind === 'const' && decl.id?.type === 'Identifier' && bindings[0]) {
			constants.set(bindings[0].binding, decl.init);
		}
	}
	const bindingOf = (identifier) =>
		resolveBinding(analysis.nodeScopes.get(identifier), identifier.name);

	function localFunction(expression) {
		const node = unwrap(expression);
		if (FUNCTIONS.has(node?.type)) return node;
		if (node?.type !== 'Identifier') return null;
		const binding = bindingOf(node);
		return binding && !binding.reassigned ? (functions.get(binding) ?? null) : null;
	}

	function declaredWithin(binding, fn) {
		const owner = analysis.functionScopes.get(fn);
		for (let scope = binding.scope; scope != null; scope = scope.parent) {
			if (scope === owner) return true;
			if (scope.kind === 'function') return false;
		}
		return false;
	}

	// An expression that evaluates to a newly allocated object on every call.
	function fresh(expression, fn, active) {
		const node = unwrap(expression);
		switch (node?.type) {
			case 'ObjectExpression':
			case 'ArrayExpression':
				return true;
			case 'SequenceExpression':
				return fresh(node.expressions?.at(-1), fn, active);
			case 'ConditionalExpression':
				return fresh(node.consequent, fn, active) && fresh(node.alternate, fn, active);
			case 'NewExpression': {
				const callee = unwrap(node.callee);
				return (
					callee?.type === 'Identifier' &&
					FRESH_CONSTRUCTORS.has(callee.name) &&
					bindingOf(callee) === null
				);
			}
			case 'Identifier': {
				// A constant allocated by this call, never a module-level shared value.
				const binding = bindingOf(node);
				return (
					binding != null &&
					constants.has(binding) &&
					declaredWithin(binding, fn) &&
					fresh(constants.get(binding), fn, active)
				);
			}
			case 'CallExpression': {
				const callee = unwrap(node.callee);
				if (callee?.type === 'MemberExpression') {
					const method = propertyName(callee);
					const receiver = unwrap(callee.object);
					const statics =
						receiver?.type === 'Identifier' ? FRESH_STATICS.get(receiver.name) : undefined;
					if (statics !== undefined) return statics.has(method) && bindingOf(receiver) === null;
					return COPY_METHODS.has(method);
				}
				if (callee?.type === 'Identifier' && callee.name === 'structuredClone') {
					return bindingOf(callee) === null;
				}
				const target = localFunction(callee);
				return target !== null && freshReturn(target, active) !== null;
			}
			default:
				return false;
		}
	}

	// The first returned expression when every completion returns a fresh value.
	function freshReturn(fn, active = new Set()) {
		if (active.has(fn) || fn.async === true || fn.generator === true) return null;
		active.add(fn);
		try {
			if (fn.body?.type !== 'BlockStatement') {
				return fresh(fn.body, fn, active) ? unwrap(fn.body) : null;
			}
			const returns = [];
			collectReturns(fn.body, returns);
			if (returns.length === 0 || !alwaysReturns(fn.body.body)) return null;
			for (const statement of returns) {
				if (!fresh(statement.argument, fn, active)) return null;
			}
			return unwrap(returns[0].argument);
		} finally {
			active.delete(fn);
		}
	}

	const reported = new Set();
	const diagnostics = [];
	for (const call of calls) {
		const args = call.arguments ?? [];
		for (const index of [1, 2]) {
			if (args.slice(0, index + 1).some((argument) => argument?.type === 'SpreadElement')) break;
			const fn = localFunction(args[index]);
			const node = fn === null ? null : freshReturn(fn);
			if (node === null || reported.has(node)) continue;
			reported.add(node);
			diagnostics.push(diagnostic(STRONG_UNCACHED_STORE_SNAPSHOT, node, MESSAGE));
		}
	}
	return diagnostics;
}

function collectReturns(node, returns) {
	if (node == null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) collectReturns(child, returns);
		return;
	}
	if (
		FUNCTIONS.has(node.type) ||
		node.type === 'ClassDeclaration' ||
		node.type === 'ClassExpression'
	) {
		return;
	}
	if (node.type === 'ReturnStatement') returns.push(node);
	for (const key in node) {
		if (!SKIP_KEYS.has(key) && !key.startsWith('_octane')) collectReturns(node[key], returns);
	}
}

// Conservative: the statement list cannot complete normally.
function alwaysReturns(statements) {
	const last = statements?.at(-1);
	switch (last?.type) {
		case 'ReturnStatement':
		case 'ThrowStatement':
			return true;
		case 'BlockStatement':
			return alwaysReturns(last.body);
		case 'IfStatement':
			return (
				last.alternate != null &&
				alwaysReturns([last.consequent]) &&
				alwaysReturns([last.alternate])
			);
		default:
			return false;
	}
}
