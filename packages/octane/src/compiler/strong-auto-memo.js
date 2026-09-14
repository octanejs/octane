import { builders as b } from '@tsrx/core';
import { inheritHookMemoOrigin as origin } from './inline-hook-memo.js';
import { analyzeStrongMemoCandidates, STRONG_AUTOMATIC_MEMO_UNSUPPORTED } from './hook-deps.js';

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'metadata', 'parent']);

export function unsupportedStrongAutomaticMemo(node, filename, message) {
	const line = node?.loc?.start?.line ?? 1;
	const column = node?.loc?.start?.column ?? 0;
	const error = new SyntaxError(
		`${filename ?? '<anonymous>'}:${line}:${column + 1}: [${STRONG_AUTOMATIC_MEMO_UNSUPPORTED}] ${message}`,
	);
	Object.assign(error, {
		code: STRONG_AUTOMATIC_MEMO_UNSUPPORTED,
		filename,
		loc: { line, column },
		pos: node?.start ?? 0,
		end: node?.end ?? 0,
	});
	return error;
}

/**
 * Cache eligible Strong declarations before dependency inference. These hooks
 * retain effect/subscription identity in development as well as production;
 * later production passes may inline the same runtime cache semantics.
 * The caller invokes this only after validating authored Strong source.
 */
export function applyStrongAutomaticMemo(ast, options = {}) {
	const { candidates, names, hookCalls, omittedDependencies } = analyzeStrongMemoCandidates(
		ast,
		options,
	);
	if (candidates.size === 0 && hookCalls.size === 0 && omittedDependencies.size === 0) return ast;
	const aliases = new Map();
	for (const hook of new Set([...candidates.values(), ...hookCalls.values()])) {
		let alias = `_$strong${hook}`;
		while (names.has(alias)) alias += '_';
		names.add(alias);
		aliases.set(hook, alias);
	}
	function rebuild(node) {
		if (!node || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			const children = node.map(rebuild);
			return children.some((child, index) => child !== node[index]) ? children : node;
		}
		const importedHook = hookCalls.get(node);
		const omittedDependency = omittedDependencies.has(node);
		if (importedHook || omittedDependency) {
			// Built-in exports are immutable and defined: normalize proven aliases
			// and optional calls so existing dependency/slot passes see their ABI.
			return {
				...node,
				callee: importedHook ? b.id(aliases.get(importedHook), node.callee) : rebuild(node.callee),
				optional: false,
				arguments: rebuild(node.arguments),
				// Replace the proven placeholder during inference, keeping later slot
				// arguments at their authored positions. Never rewrite an array.
				...(omittedDependency ? { _octaneStrongOmittedDependency: true } : {}),
			};
		}
		const hook = candidates.get(node);
		if (hook) {
			const initial = rebuild(node.init);
			const callback = hook === 'useCallback' ? initial : origin(b.arrow([], initial), node.init);
			return { ...node, init: origin(b.call(b.id(aliases.get(hook)), callback), node.init) };
		}
		let output = node;
		for (const key in node) {
			if (SKIP_KEYS.has(key)) continue;
			const value = rebuild(node[key]);
			if (value !== node[key]) {
				if (output === node) output = { ...node };
				output[key] = value;
			}
		}
		return output;
	}
	const result = rebuild(ast);
	if (aliases.size === 0) return result;
	const imports = origin(
		b.imports(
			[...aliases].map(([hook, alias]) => [hook, alias]),
			'octane',
		),
		ast.body.find((node) => node.loc) ?? ast,
	);
	return { ...result, body: [...result.body, imports] };
}
