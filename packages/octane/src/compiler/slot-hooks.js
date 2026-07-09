// Lightweight, surgical hook-slotting for plain `.ts`/`.js` modules.
//
// The full `compile()` path re-emits the whole module (esrap), which can't print
// arbitrary TypeScript (index signatures, generic call signatures, type aliases) —
// so it's reserved for `.tsrx`/`.tsx`. A custom hook can also live in a plain
// module, though, and its base octane hooks still need a per-call-site slot symbol
// or they throw "useState was called without a slot symbol" at runtime.
//
// This pass parses the module (for byte offsets), finds ONLY octane BASE hook
// calls, and splices a trailing slot symbol into each — every other byte (all the
// TS the printer can't handle) passes through verbatim. It does NOT wrap custom
// hooks in `withSlot` (that's done by the `.tsrx`/`.tsx` CALLER, and wrapping a
// hand-written binding that already forwards a slot would double-slot it), so no
// runtime import is needed: base hooks are already imported by the user.

import { parseModule } from '@tsrx/core';
import { HOOK_NAMES } from './compile.js';

// Build local-name → imported-name for hooks imported from 'octane' (handles
// `import { useState as s }`). Namespace imports (`import * as o`) are ignored —
// `o.useState(...)` has a MemberExpression callee, which the call walk never
// matches, so it's skipped for free (matching the `.tsrx` path).
function octaneHookLocals(ast) {
	const locals = new Map();
	let importsHook = false;
	for (const node of ast.body || []) {
		if (node.type !== 'ImportDeclaration' || node.source?.value !== 'octane') continue;
		for (const sp of node.specifiers || []) {
			if (sp.type !== 'ImportSpecifier') continue;
			const imported = sp.imported?.name;
			const local = sp.local?.name;
			if (!imported || !local) continue;
			locals.set(local, imported);
			if (HOOK_NAMES.has(imported)) importsHook = true;
		}
	}
	return importsHook ? locals : null;
}

// DFS in SOURCE ORDER, allocating a hook's slot id BEFORE descending into its args
// — identical pre-order to rewriteHookCalls, so a base hook nested as an argument
// (e.g. in a deps array) gets its own stable id. Collects insertion edits + the
// `const _h$N = Symbol.for(...)` declarations.
function walk(node, fnName, st) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const n of node) walk(n, fnName, st);
		return;
	}

	// A `const x = (…) => …` / `function …` gives the enclosing name used in the
	// (debug-only) slot key. For a named declaration the id is on the node; for an
	// arrow/expr assigned to a `const`, take the declarator name.
	if (
		node.type === 'VariableDeclarator' &&
		node.id?.type === 'Identifier' &&
		(node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
	) {
		walk(node.init, node.id.name, st);
		return; // the id is a binding, no hooks there
	}
	const childFn = node.type === 'FunctionDeclaration' && node.id ? node.id.name : fnName;

	if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
		const local = node.callee.name;
		const imported = st.locals.get(local);
		if (imported && HOOK_NAMES.has(imported)) {
			const id = st.nextId++;
			const sym = `_h$${id}`;
			if (st.hmr) {
				const key = `octane:${st.filename}:${fnName}.${local}#${id}`;
				st.decls.push(`const ${sym} = Symbol.for(${JSON.stringify(key)});`);
			} else {
				st.decls.push(`const ${sym} = Symbol();`);
			}
			if (node.arguments.length === 0) {
				// `useId()` → `useId(_h$N)` (insert before the closing paren).
				st.edits.push({ pos: node.end - 1, text: sym });
			} else {
				// `useState(0)` → `useState(0, _h$N)` — insert AFTER the last arg's end so
				// trailing commas / whitespace before `)` stay valid.
				st.edits.push({ pos: node.arguments[node.arguments.length - 1].end, text: ', ' + sym });
			}
		}
	}

	for (const k in node) {
		if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
		const v = node[k];
		if (v && typeof v === 'object') walk(v, childFn, st);
	}
}

/**
 * Inject per-call-site slot symbols into octane BASE hook calls in a plain
 * `.ts`/`.js` module. Returns `null` (pass through unchanged) when the module
 * imports no octane base hook or calls none.
 *
 * @param {string} source raw module text
 * @param {string} id     module id (embedded in the stable Symbol.for key)
 * @param {{ hmr?: boolean }} [options] `hmr: true` (dev serve) emits
 *   `Symbol.for(stableKey)` so a re-imported module resolves the same hook
 *   slots (state survives HMR); off (prod builds, SSR) emits plain `Symbol()`
 *   — module-instance-stable, smaller, and no module path in the output.
 * @returns {{ code: string, map: null } | null}
 */
export function slotHooks(source, id, options) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return null; // let the normal pipeline surface the parse error
	}
	const locals = octaneHookLocals(ast);
	if (locals === null) return null;

	const st = {
		locals,
		filename: id,
		hmr: !!(options && options.hmr),
		nextId: 0,
		edits: [],
		decls: [],
	};
	for (const node of ast.body || []) walk(node, 'module', st);
	if (st.edits.length === 0) return null;

	// Apply insertions right-to-left so earlier offsets stay valid.
	st.edits.sort((a, b) => b.pos - a.pos);
	let code = source;
	for (const e of st.edits) code = code.slice(0, e.pos) + e.text + code.slice(e.pos);

	// APPEND the slot consts (rather than prepend) so every original line number
	// stays put — this pass emits no source map, so aligned lines are what keep
	// stack traces / breakpoints in the user's `.ts` accurate. `Symbol.for` is
	// side-effect-free and the consts are read only inside function bodies (which
	// run after the module is fully evaluated, including cross-module imports), so
	// trailing placement has no TDZ hazard for any valid hook usage.
	const block = st.decls.join('\n') + '\n';
	code = code.endsWith('\n') ? code + block : code + '\n' + block;
	return { code, map: null };
}
