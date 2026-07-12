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
import { HOOK_NAMES, hookSlotHash } from './compile.js';
import { analyzeHookDependencies } from './hook-deps.js';

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

const STATE_GETTER_HELPERS = {
	useState: '__useStateWithGetter',
	useReducer: '__useReducerWithGetter',
};

function arrayPatternObservesStateGetter(pattern) {
	const elements = pattern.elements || [];
	if (elements[2] != null) return true;
	for (let i = 0; i <= 2 && i < elements.length; i++) {
		if (elements[i]?.type === 'RestElement') return true;
	}
	return false;
}

function isTransparentStateTupleWrapper(node, child) {
	return (
		(node?.type === 'TSAsExpression' ||
			node?.type === 'TSTypeAssertion' ||
			node?.type === 'TSNonNullExpression' ||
			node?.type === 'ParenthesizedExpression' ||
			node?.type === 'ChainExpression') &&
		node.expression === child
	);
}

// Mark base-hook calls whose source tuple can observe index 2. Direct fixed
// destructures that omit it keep the existing two-item runtime path; escaped or
// otherwise ambiguous tuples conservatively receive the full getter-enabled shape.
function collectStateGetterCalls(ast, locals) {
	const calls = new WeakSet();
	const ancestors = [];
	function walk(node) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
			const imported = locals.get(node.callee.name);
			if (STATE_GETTER_HELPERS[imported]) {
				let child = node;
				let i = ancestors.length - 1;
				while (i >= 0 && isTransparentStateTupleWrapper(ancestors[i], child)) {
					child = ancestors[i--];
				}
				const parent = i >= 0 ? ancestors[i] : null;
				let observed = true;
				if (parent?.type === 'VariableDeclarator' && parent.init === child) {
					observed =
						parent.id.type !== 'ArrayPattern' || arrayPatternObservesStateGetter(parent.id);
				} else if (parent?.type === 'AssignmentExpression' && parent.right === child) {
					observed =
						parent.left.type !== 'ArrayPattern' || arrayPatternObservesStateGetter(parent.left);
				} else if (parent?.type === 'MemberExpression' && parent.object === child) {
					const p = parent.property;
					const index = parent.computed && p?.type === 'Literal' ? Number(p.value) : NaN;
					observed = index !== 0 && index !== 1;
				} else if (parent?.type === 'ExpressionStatement') {
					observed = false;
				}
				if (observed) calls.add(node);
			}
		}
		ancestors.push(node);
		for (const key in node) {
			if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
			walk(node[key]);
		}
		ancestors.pop();
	}
	walk(ast);
	return calls;
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
				// The description must be UNIQUE and non-empty: the runtime composes
				// custom-hook slot paths from slot DESCRIPTIONS (resolveSlot) — a bare
				// Symbol() collapses those paths and collides state across call sites.
				// Short filename hash + index; no module path in the output (see
				// compile.js hookSlotHash for the full rationale).
				st.decls.push(`const ${sym} = Symbol(${JSON.stringify(`${st.hash}#${id}`)});`);
			}
			const inferred = st.inferred.get(node);
			if (inferred !== undefined) {
				// The dependency callback is already the final user argument. Insert
				// both the generated array and slot in one edit so equal-position edit
				// ordering cannot reverse them. Dependency nodes retain original source
				// offsets, preserving arbitrary TS syntax byte-for-byte.
				const deps = inferred.dependencies
					.map((dependency) => st.source.slice(dependency.node.start, dependency.node.end))
					.join(', ');
				st.edits.push({
					pos: node.arguments[node.arguments.length - 1].end,
					text: `, [${deps}], ${sym}`,
				});
			} else if (node.arguments.length === 0) {
				// `useId()` → `useId(_h$N)` (insert before the closing paren).
				st.edits.push({ pos: node.end - 1, text: sym });
			} else {
				// `useState(0)` → `useState(0, _h$N)` — insert AFTER the last arg's end so
				// trailing commas / whitespace before `)` stay valid.
				st.edits.push({ pos: node.arguments[node.arguments.length - 1].end, text: ', ' + sym });
			}
			if (st.getterCalls.has(node) && STATE_GETTER_HELPERS[imported]) {
				let helper = st.getterHelpers.get(imported);
				if (helper === undefined) {
					const base = `_$${STATE_GETTER_HELPERS[imported]}`;
					helper = base;
					let suffix = 0;
					while (st.source.includes(helper)) helper = `${base}$${++suffix}`;
					st.getterHelpers.set(imported, helper);
				}
				st.edits.push({ pos: node.callee.start, end: node.callee.end, text: helper });
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
 *   slots (state survives HMR); off (prod builds, SSR) emits
 *   `Symbol("<filenameHash>#<n>")` — module-instance-stable, smaller, no
 *   module path in the output, and the description stays unique (the runtime
 *   composes custom-hook slot paths from descriptions).
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
		source,
		inferred: analyzeHookDependencies(ast, {
			filename: id,
			onlyImported: true,
		}),
		getterCalls: collectStateGetterCalls(ast, locals),
		getterHelpers: new Map(),
		filename: id,
		hmr: !!(options && options.hmr),
		hash: hookSlotHash(id),
		nextId: 0,
		edits: [],
		decls: [],
	};
	for (const node of ast.body || []) walk(node, 'module', st);
	if (st.edits.length === 0) return null;

	// Apply insertions right-to-left so earlier offsets stay valid.
	st.edits.sort((a, b) => b.pos - a.pos);
	let code = source;
	for (const e of st.edits) {
		code = code.slice(0, e.pos) + e.text + code.slice(e.end === undefined ? e.pos : e.end);
	}

	// APPEND the slot consts (rather than prepend) so every original line number
	// stays put — this pass emits no source map, so aligned lines are what keep
	// stack traces / breakpoints in the user's `.ts` accurate. `Symbol.for` is
	// side-effect-free and the consts are read only inside function bodies (which
	// run after the module is fully evaluated, including cross-module imports), so
	// trailing placement has no TDZ hazard for any valid hook usage.
	const helperImport =
		st.getterHelpers.size === 0
			? ''
			: `import { ${[...st.getterHelpers]
					.map(([hook, local]) => `${STATE_GETTER_HELPERS[hook]} as ${local}`)
					.join(', ')} } from 'octane';\n`;
	const block = helperImport + st.decls.join('\n') + '\n';
	code = code.endsWith('\n') ? code + block : code + '\n' + block;
	return { code, map: null };
}
