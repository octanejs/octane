/**
 * @octanejs/mdx — the Vite plugin (`…/vite` entry).
 *
 * `octaneMdx()` transforms `.mdx` (and by default `.md`) modules through the
 * full pipeline in `./compile` — @mdx-js/mdx (JSX source) → octane/compiler —
 * and returns FINAL JS, so it composes with `@octanejs/vite-plugin` /
 * `octane/compiler/vite` without ordering hazards: both are `enforce: 'pre'`,
 * but the octane plugin only claims `.tsrx`/`.tsx`/`.ts`/`.js` ids and this one
 * only claims `.mdx`/`.md`, so the two transforms never see the same module.
 *
 * SSR target selection mirrors `octane/compiler/vite` exactly: an explicit
 * `ssr` option wins; otherwise Vite's transform-level SSR flag OR the
 * environment consumer marks a server build (`mode: 'server'` codegen), so the
 * SAME document renders to HTML strings on the server and hydratable DOM code
 * on the client.
 *
 * Authored in `.js` (like octane's `compiler/vite.js` and @octanejs/stylex's
 * vite entry) so the plugin loads when a consuming app's `vite.config.ts`
 * pulls it in through Node's ESM loader — which resolves the on-disk file
 * exactly as written and never applies TS-style `.js` → `.ts` mapping.
 */
import { compileMdx } from './compile.js';
import { createOctaneCompiler } from 'octane/compiler/bundler';

/**
 * @typedef {Omit<import('./compile.js').CompileMdxOptions, 'mode' | 'hmr' | 'dev'> & {
 *   ssr?: boolean,
 *   md?: boolean,
 *   hmr?: boolean,
 *   profile?: boolean,
 * }} OctaneMdxPluginOptions
 *
 * `ssr` forces the codegen target for EVERY module — `true` always server,
 * `false` always client. Leave unset for per-module auto-detection (standard
 * Vite SSR setups). Mirrors `octane/compiler/vite`'s `ssr` option.
 * `md` also transforms `.md` modules (plain-markdown format). Default `true`.
 * `hmr` is the octane HMR/dev metadata override; defaults to on in serve mode
 * (client only).
 * `profile` enables profiling metadata in client modules only.
 * `autoMemo` enables compiler-inferred component/calculation-region memoization in
 * production client modules and defaults to `true`.
 */

/**
 * Structural Vite plugin type — avoids a hard type dependency on vite (this
 * package's published surface is source; see @octanejs/stylex's vite entry for
 * the same choice).
 *
 * @typedef {{
 *   name: string,
 *   enforce: 'pre',
 *   configResolved(config: { command: string, root?: string }): void,
 *   watchChange(id: string): void,
 *   transform(this: { addWatchFile?(id: string): void, environment?: { config?: { consumer?: string } } }, code: string, id: string, options?: { ssr?: boolean }): Promise<{ code: string, map: unknown } | null>,
 * }} OctaneMdxPlugin
 */

/**
 * @param {OctaneMdxPluginOptions} [options]
 * @returns {OctaneMdxPlugin}
 */
export function octaneMdx(options = {}) {
	const { ssr: forceSsr, md, hmr, profile, ...compileOptions } = options;
	let hmrEnabled = hmr;
	let projectRoot = process.cwd();
	let profileIds = createOctaneCompiler({ root: projectRoot });
	const includeMd = md !== false;
	return {
		name: 'octane-mdx',
		enforce: 'pre',
		configResolved(config) {
			projectRoot = config.root ?? projectRoot;
			profileIds = createOctaneCompiler({ root: projectRoot });
			if (hmrEnabled === undefined) hmrEnabled = config.command === 'serve';
		},
		watchChange(id) {
			profileIds.invalidate(id);
		},
		async transform(code, id, transformOptions) {
			const [file, query = ''] = id.split('?'); // Vite ids carry ?v=/?used/?raw/… suffixes
			if (!(file.endsWith('.mdx') || (includeMd && file.endsWith('.md')))) return null;
			// An ASSET-query import (`import text from './doc.md?raw'`, ?url, ?inline)
			// is vite's territory: its asset plugin already LOADED the module as JS
			// (`export default "…"`), so compiling here would mangle it — and the
			// author explicitly asked for the file, not the document. Internal
			// bookkeeping queries (?v=hash, ?used, ?import) still transform.
			if (/(^|&)(raw|url|inline|worker|sharedworker)(=|&|$)/.test(query)) return null;
			const ssr =
				forceSsr !== undefined
					? forceSsr
					: transformOptions?.ssr === true || this.environment?.config?.consumer === 'server';
			const profiling = !ssr && profile === true;
			// Preserve the historical filename (and therefore output/source maps) in
			// ordinary and server builds. Profile metadata needs the portable ID, so
			// only the explicit client profiling specialization canonicalizes it.
			const profileIdentity = profiling ? profileIds.resolveProfileModuleId(file) : null;
			for (const dependency of profileIdentity?.dependencies ?? []) {
				this.addWatchFile?.(dependency);
			}
			const compilerId = profileIdentity?.id ?? file;
			return compileMdx(code, compilerId, {
				...compileOptions,
				mode: ssr ? 'server' : 'client',
				hmr: !ssr && !!hmrEnabled,
				dev: !ssr && !!hmrEnabled,
				profile: profiling,
			});
		},
	};
}
