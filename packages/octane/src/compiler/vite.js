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
 *   - `compat`: compatibility plugins placed immediately after the compiler.
 *   - `tsx`: compile `.tsx` through the full octane compiler (default `true`).
 *     Set `false` when React owns `.tsx` in the project — incremental adoption
 *     with @octanejs/react-wrapper, or React-authored islands rendered through
 *     @octanejs/react-compat — so only `.tsrx` is octane-compiled.
 */
import { compile } from './compile.js';
import { slotHooks } from './slot-hooks.js';

export function octane(options = {}) {
	let hmrEnabled = options.hmr;
	const compat = options.compat ?? [];
	// An explicit override of the per-module SSR auto-detection (true → always
	// server, false → always client). `undefined` keeps auto-detection.
	const forceSsr = options.ssr;
	// Path fragments to skip in the plain `.ts`/`.js` hook-slotting pass — for
	// hand-written library bindings that forward slots themselves (which would
	// otherwise be double-slotted). In a real app these live in node_modules and
	// are skipped automatically; this is for monorepo / aliased-to-source setups.
	const excludePaths = options.exclude ?? [];
	const compileTsx = options.tsx !== false;
	const plugin = {
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
			if (
				file.endsWith('.tsrx') ||
				(compileTsx && file.endsWith('.tsx') && !file.includes('/node_modules/'))
			) {
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
				});
				return { code: out.code, map: out.map };
			}

			// Plain `.ts`/`.js` can't be re-emitted (esrap can't print arbitrary TS), so a
			// custom hook living there gets the SURGICAL, hook-only pass: only octane base
			// hook calls are edited; every other byte passes through. Skip node_modules
			// (published bindings ship pre-slotted), the `// octane-no-slot` opt-out, and
			// any configured exclude path. Cheap import pre-check before parsing.
			if ((file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')) {
				if (file.includes('/node_modules/')) return null;
				if (/\/\/\s*octane-no-slot\b/.test(code)) return null;
				if (excludePaths.some((p) => file.includes(p))) return null;
				if (!/from\s*['"]octane['"]/.test(code)) return null;
				return slotHooks(code, id);
			}

			return null;
		},
	};
	return compat.length === 0 ? plugin : [plugin, ...compat];
}
