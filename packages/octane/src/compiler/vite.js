/**
 * Vite plugin for compiling .tsrx files via octane/compiler compiler.
 *
 * Per-module target is chosen from Vite's SSR signal: a module compiled for the
 * server environment uses `mode: 'server'` (SSR HTML output), everything else
 * uses `mode: 'client'` (template-clone DOM runtime). This auto-detection is
 * what a standard Vite SSR setup relies on — the SAME `.tsrx` is compiled to
 * client code for the browser bundle and to server code when loaded through
 * `ssrLoadModule` / an SSR build (see playground/octane-ssr).
 *
 * Options:
 *   - `ssr`: force the target for EVERY module — `true` always compiles server
 *     mode, `false` always client. Leave it unset (the default) to use the
 *     per-module auto-detection above. Useful for a dedicated server build.
 *   - `hmr`: defaults to on in serve mode and is always off for SSR; pass
 *     `true`/`false` to override the client default.
 *   - `parallelUse`: the parallel-`use()` pipeline (auto-memoized creations,
 *     hoisted parallel starts, batched unwrap, fetch-tree warming —
 *     docs/suspense-parallel-use-plan.md). ON by default (client mode); pass
 *     `false` to opt out and restore React-timing waterfall semantics.
 *   - `exclude`: ad-hoc path fragments the `.ts`/`.js` hook-slotting pass must
 *     skip. Rarely needed — a library whose sources hand-forward hook slots
 *     declares `"octane": { "hookSlots": { "manual": ["src"] } }` in its own package.json
 *     and is skipped automatically (see hasManualHookSlots below).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { compile } from './compile.js';
import { slotHooks } from './slot-hooks.js';

// A binding whose `.ts`/`.js` sources hand-forward hook slots (explicit slot
// symbols / subSlot composition) declares it ONCE in its own package.json,
// listing the package-relative directories those sources live in:
//
//   "octane": { "hookSlots": { "manual": ["src"] } }
//
// The surgical slot pass walks up from each candidate file to the NEAREST
// package.json and skips the file when it sits under a declared directory — so
// the trait travels with the package into every consumer (root vitest
// projects, the website, examples, builds) instead of being repeated as
// per-config `exclude` path lists that can drift. The scope is a directory
// list (not the whole package) because the package's OWN test files must stay
// auto-slotted: hook callbacks written inline in tests rely on their
// call-site slots. Manifest lookups are cached per directory; the cache is
// module-level so all plugin instances (e.g. the many vitest projects) share
// it.
const manifestRuleCache = new Map();

function nearestManualHookSlotRule(fileDir) {
	const missed = [];
	let dir = fileDir;
	let rule = null;
	for (;;) {
		if (manifestRuleCache.has(dir)) {
			rule = manifestRuleCache.get(dir);
			break;
		}
		missed.push(dir);
		let pkg = null;
		try {
			pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
		} catch {
			// no manifest in this directory (or unreadable) — keep walking up
		}
		if (pkg !== null) {
			// Nearest manifest wins — a package without the declaration is
			// auto-slotted; don't let an outer (e.g. monorepo root) manifest speak
			// for it.
			const manual = pkg.octane?.hookSlots?.manual;
			rule = Array.isArray(manual) ? { root: dir, dirs: manual } : null;
			break;
		}
		const parent = dirname(dir);
		if (parent === dir) break; // filesystem root, no manifest anywhere
		dir = parent;
	}
	for (const d of missed) manifestRuleCache.set(d, rule);
	return rule;
}

function hasManualHookSlots(file) {
	const rule = nearestManualHookSlotRule(dirname(file));
	if (rule === null) return false;
	return rule.dirs.some((d) => file.startsWith(rule.root + '/' + d.replace(/\/+$/, '') + '/'));
}

export function octane(options = {}) {
	let hmrEnabled = options.hmr;
	// An explicit override of the per-module SSR auto-detection (true → always
	// server, false → always client). `undefined` keeps auto-detection.
	const forceSsr = options.ssr;
	// Ad-hoc path fragments to skip in the plain `.ts`/`.js` hook-slotting pass.
	// Hand-slot-forwarding bindings should NOT need this: they self-declare via
	// `"octane": { "hookSlots": { "manual": ["src"] } }` in their package.json (see
	// hasManualHookSlots above), and published bindings live in node_modules and
	// are skipped automatically. This option remains as an escape hatch for
	// sources that can't carry a manifest declaration.
	const excludePaths = options.exclude ?? [];
	return {
		name: 'octane',
		enforce: 'pre',
		configResolved(config) {
			if (hmrEnabled === undefined) hmrEnabled = config.command === 'serve';
		},
		transform(code, id, transformOptions) {
			const file = id.split('?')[0]; // strip Vite's ?v=/?used query suffix

			// `.tsrx` and `.tsx` (TS + JSX) go through the FULL compiler — it lowers JSX
			// and slots hooks. `.tsx` in node_modules is skipped (a published dep ships
			// compiled `.js`; a stray React `.tsx` there must not be octane-compiled);
			// `.tsrx` keeps its existing always-compile behavior. Mirror Ripple's mode
			// decision: an explicit `options.ssr` override wins; otherwise Vite's
			// transform-level SSR flag OR the environment consumer marks a server build.
			if (file.endsWith('.tsrx') || (file.endsWith('.tsx') && !file.includes('/node_modules/'))) {
				const ssr =
					forceSsr !== undefined
						? forceSsr
						: transformOptions?.ssr === true || this.environment?.config?.consumer === 'server';
				const out = compile(code, id, {
					hmr: !ssr && !!hmrEnabled,
					mode: ssr ? 'server' : 'client',
					// Dev-only hydration source-LOC metadata — same serve+client gate as HMR.
					// Off in SSR + prod builds, so production output is byte-identical.
					dev: !ssr && !!hmrEnabled,
					parallelUse: options.parallelUse !== false,
				});
				return { code: out.code, map: out.map };
			}

			// Plain `.ts`/`.js` can't be re-emitted (esrap can't print arbitrary TS), so a
			// custom hook living there gets the SURGICAL, hook-only pass: only octane base
			// hook calls are edited; every other byte passes through. Skip node_modules
			// (published bindings ship pre-slotted), the `// octane-no-slot` opt-out, any
			// configured exclude path, and packages whose manifest declares manual hook
			// slots. Cheap import pre-check before parsing (and before touching the fs).
			if ((file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')) {
				if (file.includes('/node_modules/')) return null;
				if (/\/\/\s*octane-no-slot\b/.test(code)) return null;
				if (excludePaths.some((p) => file.includes(p))) return null;
				if (!/from\s*['"]octane['"]/.test(code)) return null;
				if (hasManualHookSlots(file)) return null;
				// Same HMR gate as the full compiler: dev serve gets Symbol.for
				// (registry identity survives re-import), builds/SSR get Symbol().
				const ssr =
					forceSsr !== undefined
						? forceSsr
						: transformOptions?.ssr === true || this.environment?.config?.consumer === 'server';
				return slotHooks(code, id, { hmr: !ssr && !!hmrEnabled });
			}

			return null;
		},
	};
}
