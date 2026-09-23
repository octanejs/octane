// Octane factories whose runtime declarations carry `/* @__NO_SIDE_EFFECTS__ */`.
//
// Rollup (and so Vite) propagates that declaration annotation to call sites in
// other modules, but esbuild deliberately does not: its tree-shaking decisions
// are local to the file containing the call (esbuild CHANGELOG 0.18.1). An
// unused module-scope `const Ctx = createContext(…)` therefore counts as a
// side effect under esbuild and retains the whole client runtime through
// createContext's provider body. The compiler owns every Octane module's
// output, so it annotates these call sites with the portable `/* @__PURE__ */`
// convention that every bundler honors.
//
// Only the client DOM runtime declares all four factories side-effect-free.
// The server `createContext` registers the context, and universal renderers
// ship their own factories, so those targets keep the `lazy`-only set.
const CLIENT_DOM_PURE_FACTORIES = new Set(['createContext', 'createPortal', 'lazy', 'memo']);
const PORTABLE_PURE_FACTORIES = new Set(['lazy']);

/**
 * @param {{ clientDom: boolean }} target
 * @returns {ReadonlySet<string>}
 */
export function octanePureFactoryNames({ clientDom }) {
	return clientDom ? CLIENT_DOM_PURE_FACTORIES : PORTABLE_PURE_FACTORIES;
}

/**
 * Local names bound by `import { … } from 'octane'` to a pure factory.
 * @param {any[]} body
 * @param {ReadonlySet<string>} names
 * @returns {Set<string>}
 */
export function collectPureFactoryLocals(body, names) {
	const locals = new Set();
	for (const node of body || []) {
		if (node.type !== 'ImportDeclaration' || node.source?.value !== 'octane') continue;
		if (node.importKind === 'type') continue;
		for (const specifier of node.specifiers || []) {
			if (
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				names.has(specifier.imported?.name ?? specifier.imported?.value) &&
				specifier.local?.name
			) {
				locals.add(specifier.local.name);
			}
		}
	}
	return locals;
}

/** Whether `node` is a direct call to one of `locals`. */
export function isPureFactoryCall(node, locals) {
	return (
		node?.type === 'CallExpression' &&
		node.callee?.type === 'Identifier' &&
		locals.has(node.callee.name)
	);
}

// Authored annotations stay authoritative; never stack a second one.
const AUTHORED_PURE_BEFORE = /\/\*\s*[#@]__PURE__\s*\*\/\s*$/;

/** Whether authored source already annotates the call starting at `start`. */
export function hasAuthoredPureAnnotation(source, start) {
	return AUTHORED_PURE_BEFORE.test(source.slice(Math.max(0, start - 64), start));
}
