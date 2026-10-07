import { createHash } from 'node:crypto';

// Main-thread helpers shared by the cross-module proof controllers. Each walk
// reads the current compilation; native-backed Modules never enter retained
// proof state, only their identifiers and source fingerprints do.

export const JAVASCRIPT_TYPES = new Set(['javascript/auto', 'javascript/esm']);

export function sourceHash(source) {
	return createHash('sha256').update(String(source)).digest('hex');
}

export function iterable(value) {
	return value != null && typeof value[Symbol.iterator] === 'function' ? value : [];
}

export function identifier(module) {
	if (typeof module?.identifier !== 'function') return null;
	const id = module.identifier();
	return typeof id === 'string' ? id : null;
}

export function moduleSource(module) {
	const source = module?.originalSource?.()?.source();
	if (typeof source === 'string') return source;
	return Buffer.isBuffer(source) ? source.toString('utf8') : null;
}

/** Reacquire current-build objects; native-backed Modules never enter our state. */
export function currentModules(modules) {
	const result = new Map();
	const seen = new Set();
	const visit = (module) => {
		if (module == null || seen.has(module)) return;
		seen.add(module);
		// Concatenation can move a provider under another module. Prefer the
		// original child if a wrapper happens to share its identifier.
		for (const child of iterable(module.modules)) visit(child);
		if (module.rootModule != null) visit(module.rootModule);
		const id = identifier(module);
		if (id !== null && !result.has(id)) result.set(id, module);
	};
	for (const module of iterable(modules)) visit(module);
	return result;
}

/**
 * A resource path is not an import identity: issuer rules, layers, queries,
 * dependency categories, and replacements can select different modules. Read
 * the effective target of the actual ESM edge after the make phase instead.
 */
export function targetForRequest(compilation, importer, request) {
	const targets = new Map();
	for (const connection of compilation.moduleGraph.getOutgoingConnections(importer)) {
		const dependency = connection.dependency;
		if (dependency?.request !== request || dependency.category !== 'esm') continue;
		if (dependency.attributes != null && Object.keys(dependency.attributes).length > 0) {
			return null;
		}
		const target = connection.module;
		const id = identifier(target);
		if (id === null) return null;
		targets.set(id, target);
	}
	return targets.size === 1 ? targets.values().next().value : null;
}

/** Resolve several exact requests with one fresh walk of the current graph. */
export function targetsForRequests(compilation, importer, requests) {
	const states = new Map();
	for (const request of requests) {
		states.set(request, { id: null, target: null, invalid: false });
	}
	let invalid = 0;
	for (const connection of compilation.moduleGraph.getOutgoingConnections(importer)) {
		const dependency = connection.dependency;
		if (dependency?.category !== 'esm') continue;
		const state = states.get(dependency.request);
		if (state === undefined || state.invalid) continue;
		const target = connection.module;
		const id =
			dependency.attributes != null && Object.keys(dependency.attributes).length > 0
				? null
				: identifier(target);
		if (id === null || (state.id !== null && state.id !== id)) {
			state.invalid = true;
			state.target = null;
			invalid++;
			if (invalid === states.size) break;
			continue;
		}
		state.id = id;
		state.target = target;
	}
	for (const [request, state] of states) {
		states.set(request, state.invalid ? null : state.target);
	}
	return states;
}

/** Resolve one request, or several with a single walk. */
export function targetsFor(compilation, importer, requests) {
	if (requests.length !== 1) return targetsForRequests(compilation, importer, requests);
	return new Map([[requests[0], targetForRequest(compilation, importer, requests[0])]]);
}

export function sameStrings(left, right) {
	const a = [...new Set(left)].sort();
	const b = [...new Set(right)].sort();
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Rspack owns graph mutation. Do not write source objects, synthesize entry
 * dependencies, or invoke importModule (which executes application modules).
 * Its public rebuildModule dispatcher batches synchronous requests. Ignore
 * callback Module values: Rspack may return those in a different order, and
 * only the current graph's exact identifiers authenticate the rebuilt inputs.
 */
export async function rebuildModules(compilation, ids, changed) {
	const modules = currentModules(compilation.modules);
	const pending = ids.map((id) => {
		const module = modules.get(id);
		if (module === undefined) changed(id, undefined, 'the importer disappeared before rebuilding');
		return new Promise((resolve, reject) => {
			compilation.rebuildModule(module, (error) => (error ? reject(error) : resolve()));
		});
	});
	const results = await Promise.allSettled(pending);
	for (const result of results) if (result.status === 'rejected') throw result.reason;
}

export function oneShotProduction(compiler) {
	return (
		compiler.options.mode === 'production' && compiler.watchMode !== true && !compiler.options.watch
	);
}
