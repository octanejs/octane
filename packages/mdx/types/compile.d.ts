// Hand-written declarations for src/compile.js (authored in `.js` so the vite
// entry's import chain loads under Node's native ESM loader — same convention
// as @octanejs/vite-plugin's types/). Keep in lockstep with the implementation.
import type { CompileOptions } from '@mdx-js/mdx';

export interface CompileMdxResult {
	code: string;
	map: unknown;
	diagnostics: CompileMdxDiagnostic[];
}

export interface CompileMdxDiagnosticPosition {
	offset: number;
	line: number;
	column: number;
}

export interface CompileMdxDiagnostic {
	code: string;
	severity: 'warning';
	message: string;
	filename: string;
	start: CompileMdxDiagnosticPosition;
	end: CompileMdxDiagnosticPosition;
	suggestions: Array<{
		start: CompileMdxDiagnosticPosition;
		end: CompileMdxDiagnosticPosition;
		attribute: 'onInput' | 'onInputCapture';
	}>;
}

export interface CompileMdxOptions {
	/** octane codegen target: `'client'` (DOM) or `'server'` (SSR HTML strings). Default `'client'`. */
	mode?: 'client' | 'server';
	/** octane compiler HMR wrapping (client only; the vite plugin wires this to serve mode). */
	hmr?: boolean;
	/** octane compiler dev metadata (client only; same gate as `hmr`). */
	dev?: boolean;
	/** octane compiler profiling metadata (client only). */
	profile?: boolean;
	/**
	 * Module the emitted document reads the provider mapping from
	 * (`useMDXComponents`). Defaults per mode — `'@octanejs/mdx'` (client) /
	 * `'@octanejs/mdx/server'` (server), so each runtime reads ITS OWN context
	 * store (they are disjoint; see src/server.ts). Pass `null` to disable the
	 * provider wiring entirely (only `props.components` applies).
	 */
	providerImportSource?: string | null;
	/** remark plugins. Defaults to `defaultRemarkPlugins` (GFM + frontmatter + frontmatter-export). */
	remarkPlugins?: CompileOptions['remarkPlugins'];
	rehypePlugins?: CompileOptions['rehypePlugins'];
	/** Extra recma (ESTree) plugins, run before the octane adapter pass. */
	recmaPlugins?: CompileOptions['recmaPlugins'];
	/** Source syntax: `'mdx'`, plain `'md'` (no JSX/ESM/expressions), or `'detect'` by file extension. Default `'detect'`. */
	format?: 'mdx' | 'md' | 'detect';
	/** Escape hatch: other @mdx-js/mdx options. The pipeline owns `jsx`/`outputFormat`/the options above. */
	mdxOptions?: Omit<
		CompileOptions,
		| 'jsx'
		| 'jsxRuntime'
		| 'jsxImportSource'
		| 'outputFormat'
		| 'providerImportSource'
		| 'remarkPlugins'
		| 'rehypePlugins'
		| 'recmaPlugins'
		| 'format'
		| 'SourceMapGenerator'
	>;
}

/**
 * The default remark plugin set: GitHub-flavored markdown, YAML/TOML
 * frontmatter parsing, and the `export const frontmatter = {…}` export.
 * Exported so a custom `remarkPlugins` list can extend rather than replace it.
 */
export declare const defaultRemarkPlugins: CompileOptions['remarkPlugins'];

/** Compile MDX/markdown source to a compiled octane module (async — supports async plugins). */
export declare function compileMdx(
	source: string,
	id: string,
	options?: CompileMdxOptions,
): Promise<CompileMdxResult>;

/** Synchronous {@link compileMdx} (the default plugin set is fully sync). */
export declare function compileMdxSync(
	source: string,
	id: string,
	options?: CompileMdxOptions,
): CompileMdxResult;
