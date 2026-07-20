// Hand-written declarations for src/vite.js (authored in `.js` so it loads
// from a consumer's vite.config.ts under Node's native ESM loader — same
// convention as @octanejs/vite-plugin's types/). Keep in lockstep.
import type { CompileMdxOptions, CompileMdxResult } from './compile.js';

export interface OctaneMdxPluginOptions extends Omit<
	CompileMdxOptions,
	'mode' | 'hmr' | 'dev' | 'stateModel'
> {
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
	/** Enable component profiling metadata in client modules. */
	profile?: boolean;
}

/**
 * Structural Vite plugin type — avoids a hard type dependency on vite (see
 * @octanejs/stylex's vite entry for the same choice).
 */
export interface OctaneMdxPlugin {
	name: string;
	enforce: 'pre';
	configResolved(config: {
		command: string;
		root?: string;
		plugins?: Array<{
			name?: string;
			api?: {
				octane?: {
					resolveStateModelForSource?(id: string): {
						stateModel: 'causal' | 'permissive';
						dependencies: string[];
						missingDependencies: string[];
					};
				};
			};
		}>;
	}): void;
	configureServer(server: { watcher: { add(files: string | string[]): void } }): void;
	watchChange(id: string): void;
	hotUpdate: {
		order: 'pre';
		handler(
			this: { environment: { name: string } },
			options: { file: string; server: { restart(): Promise<void> } },
		): Promise<[] | undefined>;
	};
	transform(
		this: {
			addWatchFile?(id: string): void;
			warn?(warning: {
				code: string;
				message: string;
				id: string;
				loc: { file: string; line: number; column: number };
			}): void;
			environment?: { config?: { consumer?: string } };
		},
		code: string,
		id: string,
		options?: { ssr?: boolean },
	): Promise<CompileMdxResult | null>;
}

export declare function octaneMdx(options?: OctaneMdxPluginOptions): OctaneMdxPlugin;
