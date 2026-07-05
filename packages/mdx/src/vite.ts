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
 */
import { compileMdx, type CompileMdxOptions } from './compile';

export interface OctaneMdxPluginOptions extends Omit<CompileMdxOptions, 'mode' | 'hmr' | 'dev'> {
	/**
	 * Force the codegen target for EVERY module — `true` always server, `false`
	 * always client. Leave unset for per-module auto-detection (standard Vite
	 * SSR setups). Mirrors `octane/compiler/vite`'s `ssr` option.
	 */
	ssr?: boolean;
	/** Also transform `.md` modules (plain-markdown format). Default `true`. */
	md?: boolean;
	/** octane HMR/dev metadata override; defaults to on in serve mode (client only). */
	hmr?: boolean;
}

// Structural Vite plugin type — avoids a hard type dependency on vite (this
// package's published surface is TS source; see @octanejs/stylex's vite entry
// for the same choice).
interface OctaneMdxPlugin {
	name: string;
	enforce: 'pre';
	configResolved(config: { command: string }): void;
	transform(
		this: unknown,
		code: string,
		id: string,
		options?: { ssr?: boolean },
	): Promise<{ code: string; map: unknown } | null>;
}

export function octaneMdx(options: OctaneMdxPluginOptions = {}): OctaneMdxPlugin {
	const { ssr: forceSsr, md, hmr, ...compileOptions } = options;
	let hmrEnabled = hmr;
	const includeMd = md !== false;
	return {
		name: 'octane-mdx',
		enforce: 'pre',
		configResolved(config) {
			if (hmrEnabled === undefined) hmrEnabled = config.command === 'serve';
		},
		async transform(code, id, transformOptions) {
			const file = id.split('?')[0]; // strip Vite's ?v=/?used query suffix
			if (!(file.endsWith('.mdx') || (includeMd && file.endsWith('.md')))) return null;
			const ssr =
				forceSsr !== undefined
					? forceSsr
					: transformOptions?.ssr === true ||
						(this as { environment?: { config?: { consumer?: string } } }).environment?.config
							?.consumer === 'server';
			return compileMdx(code, file, {
				...compileOptions,
				mode: ssr ? 'server' : 'client',
				hmr: !ssr && !!hmrEnabled,
				dev: !ssr && !!hmrEnabled,
			});
		},
	};
}
