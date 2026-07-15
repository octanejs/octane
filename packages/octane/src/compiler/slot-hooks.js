// Lightweight, surgical hook-slotting for plain `.ts`/`.js` modules.
//
// The full `compile()` path re-emits the whole module (esrap), which can't print
// arbitrary TypeScript (index signatures, generic call signatures, type aliases) —
// so it's reserved for `.tsrx`/`.tsx`. A custom hook can also live in a plain
// module, though, and its base octane hooks still need a per-call-site slot key
// or they throw "useState was called without a hook slot" at runtime.
//
// This pass parses the module (for byte offsets), finds ONLY octane BASE hook
// calls, and splices a trailing compiler slot into each — every other byte (all the
// TS the printer can't handle) passes through verbatim. It does NOT wrap custom
// hooks in `withSlot` (that's done by the `.tsrx`/`.tsx` CALLER, and wrapping a
// hand-written binding that already forwards a slot would double-slot it). In
// production it reserves a collision-free runtime range because these arbitrary
// helpers can execute in a Scope alongside code from any other source module.

import { parseModule } from '@tsrx/core';
import { HOOK_NAMES, hookSlotHash } from './compile.js';
import { analyzeHookDependencies } from './hook-deps.js';

// Build a cheap import-presence gate. Precise call identity is annotated by the
// lexical scope analysis in analyzeHookDependencies below; this gate only avoids
// doing the surgical edit walk for modules that cannot contain an Octane hook.
function octaneHookLocals(ast) {
	const locals = new Map();
	let importsHook = false;
	let hasOctaneImport = false;
	for (const node of ast.body || []) {
		if (node.type !== 'ImportDeclaration' || node.source?.value !== 'octane') continue;
		hasOctaneImport = true;
		for (const sp of node.specifiers || []) {
			if (sp.type === 'ImportNamespaceSpecifier' && sp.local?.name) {
				locals.set(sp.local.name, '*');
				importsHook = true;
				continue;
			}
			if (sp.type !== 'ImportSpecifier') continue;
			const imported = sp.imported?.name;
			const local = sp.local?.name;
			if (!imported || !local) continue;
			locals.set(local, imported);
			if (HOOK_NAMES.has(imported)) importsHook = true;
		}
	}
	return { locals, importsHook, hasOctaneImport };
}

// Find only the disposable top-level root shape used by production entries:
// `createRoot(target).render(ImportedComponent[, props]);`. Keeping the matcher
// this narrow means the specialized root can never escape and receive a later
// unknown render. The bundler adapter resolves and loads each returned import;
// this pass never guesses what a request points at from the importer's path.
function collectVoidRootCandidates(ast) {
	const createRootLocals = new Set();
	const componentImports = new Map();
	for (const node of ast.body || []) {
		if (node.type !== 'ImportDeclaration' || typeof node.source?.value !== 'string') continue;
		const request = node.source.value;
		for (const sp of node.specifiers || []) {
			if (request === 'octane' && sp.type === 'ImportSpecifier') {
				const imported = sp.imported?.name ?? sp.imported?.value;
				if (imported === 'createRoot' && sp.local?.name) createRootLocals.add(sp.local.name);
				continue;
			}
			if (!request.startsWith('./') && !request.startsWith('../')) continue;
			if (sp.type === 'ImportDefaultSpecifier' && sp.local?.name) {
				componentImports.set(sp.local.name, { request, imported: 'default' });
			} else if (sp.type === 'ImportSpecifier' && sp.local?.name) {
				const imported = sp.imported?.name ?? sp.imported?.value;
				if (typeof imported === 'string') {
					componentImports.set(sp.local.name, { request, imported });
				}
			}
		}
	}
	if (createRootLocals.size === 0 || componentImports.size === 0) return [];

	const candidates = [];
	for (const statement of ast.body || []) {
		if (statement.type !== 'ExpressionStatement') continue;
		const renderCall = statement.expression;
		if (
			renderCall?.type !== 'CallExpression' ||
			renderCall.optional === true ||
			renderCall.arguments.length < 1 ||
			renderCall.arguments.length > 2
		)
			continue;
		const member = renderCall.callee;
		if (
			member?.type !== 'MemberExpression' ||
			member.computed === true ||
			member.optional === true ||
			member.property?.type !== 'Identifier' ||
			member.property.name !== 'render'
		)
			continue;
		const rootCall = member.object;
		if (
			rootCall?.type !== 'CallExpression' ||
			rootCall.optional === true ||
			rootCall.callee?.type !== 'Identifier' ||
			!createRootLocals.has(rootCall.callee.name)
		)
			continue;
		const component = renderCall.arguments[0];
		if (component?.type !== 'Identifier') continue;
		const imported = componentImports.get(component.name);
		if (imported === undefined) continue;
		candidates.push({
			...imported,
			start: rootCall.callee.start,
			end: rootCall.callee.end,
		});
	}
	return candidates;
}

/**
 * Return the unique component imports used by an exactly disposable root.
 * Adapters use this before transformation so resolution and module loading can
 * establish the imported export's actual compiled contract.
 */
export function findVoidRootImports(source, id) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return [];
	}
	const unique = new Map();
	for (const { request, imported } of collectVoidRootCandidates(ast)) {
		unique.set(`${request}\0${imported}`, { request, imported });
	}
	return [...unique.values()];
}

function collectVoidRootEdits(ast, st, isVoidComponentImport) {
	if (typeof isVoidComponentImport !== 'function') return;
	for (const candidate of collectVoidRootCandidates(ast)) {
		if (!isVoidComponentImport(candidate.request, candidate.imported)) continue;
		if (st.voidRootName === null) st.voidRootName = allocSlotName(st, '_$createVoidRoot');
		st.edits.push({
			pos: candidate.start,
			end: candidate.end,
			text: st.voidRootName,
		});
	}
}

const STATE_GETTER_HELPERS = {
	useState: '__useStateWithGetter',
	useReducer: '__useReducerWithGetter',
};

function collectIdentifierNames(root) {
	const names = new Set();
	const walk = (node) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (node.type === 'Identifier' && typeof node.name === 'string') names.add(node.name);
		for (const key in node) {
			if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
			walk(node[key]);
		}
	};
	walk(root);
	return names;
}

function allocSlotName(st, preferred) {
	let name = preferred;
	while (st.usedNames.has(name)) name += '$';
	st.usedNames.add(name);
	return name;
}

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

// Mark base-hook calls whose source tuple can observe index 2. The public base
// hooks stay on the physical two-item path; escaped or ambiguous tuples
// conservatively receive the getter-enabled shape.
function collectStateGetterCalls(ast) {
	const calls = new WeakSet();
	const ancestors = [];
	function walk(node) {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (node.type === 'CallExpression') {
			const imported = node._octaneImportedHook;
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
function hookOwner(node, name) {
	const loc = node?.loc?.start;
	return { name, line: loc?.line ?? 0, column: loc?.column ?? 0 };
}

function walk(node, owner, st) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const n of node) walk(n, owner, st);
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
		walk(node.init, hookOwner(node.id, node.id.name), st);
		return; // the id is a binding, no hooks there
	}
	const childOwner =
		node.type === 'FunctionDeclaration' && node.id ? hookOwner(node, node.id.name) : owner;

	if (node.type === 'CallExpression') {
		const imported = node._octaneImportedHook;
		if (imported && HOOK_NAMES.has(imported)) {
			const local =
				node.callee?.type === 'Identifier'
					? node.callee.name
					: `${node.callee?.object?.name || 'octane'}.${imported}`;
			const id = st.nextId++;
			const sym = allocSlotName(st, `_h$${id}`);
			let symbolExpr;
			if (st.hmr) {
				const key = `octane:${st.filename}:${owner.name}.${local}#${id}`;
				symbolExpr = `Symbol.for(${JSON.stringify(key)})`;
			} else if (st.profile) {
				// The description must be UNIQUE and non-empty: the runtime composes
				// custom-hook slot paths from slot DESCRIPTIONS (resolveSlot) — a bare
				// Symbol() collapses those paths and collides state across call sites.
				// Short filename hash + index; no module path in the output (see
				// compile.js hookSlotHash for the full rationale).
				symbolExpr = `Symbol(${JSON.stringify(`${st.hash}#${id}`)})`;
			} else {
				const numericExpr = id === 0 ? st.slotBaseName : `${st.slotBaseName} + ${id}`;
				symbolExpr = `Symbol(${numericExpr})`;
			}
			if (st.profile) {
				const componentId = `${st.profileFilename || '<anon>'}#${owner.name}@${owner.line}:${owner.column}`;
				const loc = node.loc?.start;
				const metadata = {
					id: `${componentId}#hook:${id}`,
					componentId,
					name: local,
					kind: imported,
					file: st.profileFilename || '<anon>',
					line: loc?.line ?? 0,
					column: loc?.column ?? 0,
					index: id,
				};
				symbolExpr = `_$__profileHook(${symbolExpr}, ${JSON.stringify(metadata)})`;
			}
			st.decls.push(`const ${sym} = ${symbolExpr};`);
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
				// `useId()` → `useId(_h$N)`. Symbols remain self-identifying when
				// optional user arguments are omitted.
				st.edits.push({
					pos: node.end - 1,
					text: sym,
				});
			} else {
				// `useState(0)` → `useState(0, _h$N)` — insert AFTER the last arg's end so
				// trailing commas / whitespace before `)` stay valid.
				st.edits.push({
					pos: node.arguments[node.arguments.length - 1].end,
					text: ', ' + sym,
				});
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
		if (v && typeof v === 'object') walk(v, childOwner, st);
	}
}

/**
 * Inject per-call-site hook slots into octane BASE hook calls in a plain
 * `.ts`/`.js` module. Returns `null` (pass through unchanged) when the module
 * imports no octane base hook or calls none.
 *
 * @param {string} source raw module text
 * @param {string} id     module id (embedded in the stable Symbol.for key)
 * @param {{ hmr?: boolean, profile?: boolean, profileFilename?: string, isVoidComponentImport?: (request: string, imported: string) => boolean }} [options] `hmr: true` (dev serve) emits
 *   `Symbol.for(stableKey)` so a re-imported module resolves the same hook
 *   slots (state survives HMR); off (ordinary prod builds and SSR) emits
 *   runtime-ranged Symbols. Profiling retains short described Symbols because
 *   hook metadata is keyed by Symbol identity.
 * @returns {{ code: string, map: null } | null}
 */
export function slotHooks(source, id, options) {
	let ast;
	try {
		ast = parseModule(source, id);
	} catch {
		return null; // let the normal pipeline surface the parse error
	}
	const importInfo = octaneHookLocals(ast);
	const canSpecializeRoot =
		!options?.hmr &&
		!options?.profile &&
		typeof options?.isVoidComponentImport === 'function' &&
		importInfo.hasOctaneImport;
	if (!importInfo.importsHook && !canSpecializeRoot) return null;
	const inferred = importInfo.importsHook
		? analyzeHookDependencies(ast, {
				filename: id,
				onlyImported: true,
			})
		: new Map();

	const st = {
		locals: importInfo.locals,
		source,
		inferred,
		getterCalls: importInfo.importsHook ? collectStateGetterCalls(ast) : new WeakSet(),
		getterHelpers: new Map(),
		filename: id,
		profileFilename: (options && options.profileFilename) || id,
		hmr: !!(options && options.hmr),
		profile: !!(options && options.profile),
		hash: hookSlotHash(id),
		nextId: 0,
		edits: [],
		decls: [],
		usedNames: collectIdentifierNames(ast),
		slotBaseName: null,
		hookSlotsName: null,
		voidRootName: null,
	};
	if (!st.hmr && !st.profile) st.slotBaseName = allocSlotName(st, '_hs$');
	if (importInfo.importsHook) {
		for (const node of ast.body || []) walk(node, hookOwner(null, 'module'), st);
	}
	if (canSpecializeRoot) {
		collectVoidRootEdits(ast, st, options.isVoidComponentImport);
	}
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
	const helperSpecifiers = [...st.getterHelpers].map(
		([hook, local]) => `${STATE_GETTER_HELPERS[hook]} as ${local}`,
	);
	if (st.voidRootName !== null) {
		helperSpecifiers.push(`__createVoidRoot as ${st.voidRootName}`);
	}
	if (!st.hmr && !st.profile && st.nextId > 0) {
		st.hookSlotsName = allocSlotName(st, '_$hookSlots');
		helperSpecifiers.unshift(`hookSlots as ${st.hookSlotsName}`);
	}
	const helperImport =
		helperSpecifiers.length === 0
			? ''
			: `import { ${helperSpecifiers.join(', ')} } from 'octane';\n`;
	const profileImport = st.profile
		? "import { __profileHook as _$__profileHook } from 'octane/profiling';\n"
		: '';
	const slotBase =
		!st.hmr && !st.profile && st.nextId > 0
			? `const ${st.slotBaseName} = /* @__PURE__ */ ${st.hookSlotsName}(${st.nextId});\n`
			: '';
	const block = helperImport + profileImport + slotBase + st.decls.join('\n') + '\n';
	code = code.endsWith('\n') ? code + block : code + '\n' + block;
	return { code, map: null };
}
