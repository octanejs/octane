import type { Compiler, RspackPluginInstance } from '@rspack/core';

export type OctaneRspackEnvironment = 'client' | 'server';

export interface OctaneRendererRuleOptions {
	/** Glob or globs matched against canonical project-relative module IDs. */
	include: string | readonly string[];
	/** Optional glob or globs that remove files from this rule. */
	exclude?: string | readonly string[];
	/** Renderer alias declared in `registry`, or the built-in `dom` alias. */
	renderer: string;
}

/** @experimental Static source restrictions enforced for a renderer. */
export interface OctaneRendererValidationOptions {
	/** Host elements that may directly contain authored primitive text. */
	textParents?: readonly string[];
	/** Unbound JavaScript globals that renderer-owned source may not reference. */
	forbiddenGlobals?: readonly string[];
	/** Package IDs whose static imports, subpaths, and CommonJS requires are forbidden. */
	forbiddenImports?: readonly string[];
	/** Allowed static JSX attributes by host name; `*` supplies shared patterns. */
	hostProps?: Readonly<Record<string, readonly string[]>>;
}

export type OctaneRendererRegistryEntry =
	| string
	| {
			module: string;
			target?: 'dom' | 'universal';
			server?: 'render' | 'client-only' | 'unsupported';
			intrinsics?: string;
			text?: 'reject' | 'ignore' | 'host';
			capabilities?: readonly string[];
			validation?: OctaneRendererValidationOptions;
	  };

/** Static metadata for a component prop lowered for another renderer. */
export interface OctaneRendererBoundaryOptions {
	ownerRenderer: string;
	childRenderer: string;
	prop: string;
	server?: 'omit-child';
}

/** @experimental Declarative renderer selection shared with other Octane compilers. */
export interface OctaneRendererConfigOptions {
	registry?: Readonly<Record<string, OctaneRendererRegistryEntry>>;
	/** Boundary metadata keyed by stable module ID and export name. */
	boundaries?: Readonly<Record<string, Readonly<Record<string, OctaneRendererBoundaryOptions>>>>;
	default?: string;
	rules?: readonly OctaneRendererRuleOptions[];
}

/** Canonical renderer configuration accepted when another Octane integration resolved it. */
export interface OctaneResolvedRendererConfig {
	readonly registry: Readonly<
		Record<
			string,
			{
				readonly module: string;
				readonly target: 'dom' | 'universal';
				readonly server: 'render' | 'client-only' | 'unsupported';
				readonly intrinsics?: string;
				readonly text: 'reject' | 'ignore' | 'host';
				readonly capabilities: readonly string[];
				readonly validation?: Readonly<OctaneRendererValidationOptions>;
			}
		>
	>;
	readonly boundaries: Readonly<
		Record<string, Readonly<Record<string, Readonly<OctaneRendererBoundaryOptions>>>>
	>;
	readonly default: string;
	readonly rules: readonly {
		readonly include: readonly string[];
		readonly exclude: readonly string[];
		readonly renderer: string;
	}[];
	readonly signature: string;
}

export interface OctaneRspackLoaderOptions {
	/** Project root used to canonicalize module IDs and discover package manifests. */
	root?: string;
	/** Explicit compiler target. Standard Rspack web/node targets are inferred when omitted. */
	environment?: OctaneRspackEnvironment;
	/** Allow webpack-dialect HMR codegen when the loader context is hot. Default `true`. */
	hmr?: boolean;
	/** Emit client development metadata. Defaults to Rspack's non-production mode. */
	dev?: boolean;
	/** Emit client profiling metadata and enable the profiling runtime. Default `false`. */
	profile?: boolean;
	/**
	 * Path fragments excluded from the plain `.ts`/`.js` hook-slot pass. With
	 * `requireDirective`, excluded paths are exempt from Octane ownership
	 * entirely — including `.tsrx`/`.tsx` — for projects routing those paths
	 * through a different tsrx compiler (e.g. `@tsrx/react`).
	 */
	exclude?: string[];
	/** @experimental Renderer registry and ordered per-file selection rules. */
	renderers?: OctaneRendererConfigOptions | OctaneResolvedRendererConfig;
	/** Compile-only host runtime/thread identity for a universal renderer graph. */
	universalRuntime?: {
		readonly runtime: string;
		readonly thread: 'background' | 'main-thread';
	};
	/**
	 * Mixed-toolchain ownership gate: when `true`, a project `.tsrx` is
	 * Octane's by extension, a project `.tsx` compiles only when it opens
	 * with a leading `@jsxImportSource octane` pragma comment (any
	 * registered renderer's intrinsics module also counts), and plain
	 * project `.ts`/`.js` are never Octane-compiled. Unmarked project
	 * `.tsx` passes through to the host framework's own pipeline. Installed
	 * and linked packages keep their Octane package-manifest decision.
	 * @default false
	 */
	requireDirective?: boolean;
}

export interface OctaneRspackPluginOptions extends OctaneRspackLoaderOptions {
	/**
	 * Override the exact module used for plain `octane` imports in this graph.
	 * Universal host integrations use this to share one hook/context runtime
	 * between compiled templates and plain TypeScript custom hooks.
	 */
	runtime?: string;
	/**
	 * Add Rspack's built-in SWC loader to strip TypeScript after Octane runs.
	 * Disable this when another rule already owns TypeScript transpilation.
	 * @default true
	 */
	transpile?: boolean;
}

export interface OctaneRspackBuildInfo {
	canonicalId: string;
	transformKind: 'compile' | 'slots' | 'client-only-stub';
	serverRpc: boolean;
	/** Universal host runtime/thread identity, when this module was specialized. */
	universalRuntime?: {
		readonly runtime: string;
		readonly thread: 'background' | 'main-thread';
	};
	/** Stable identity shared by the client compile and its inert server stub. */
	clientReference?: {
		readonly id: string;
		readonly moduleId: string;
		readonly renderer: string;
	};
}

export declare class OctaneRspackPlugin implements RspackPluginInstance {
	constructor(options?: OctaneRspackPluginOptions);
	readonly options: Readonly<OctaneRspackPluginOptions>;
	/** Raw installed packages discovered from Octane package manifests after compilation starts. */
	sourceDependencies: readonly string[];
	apply(compiler: Compiler): void;
}

export declare function octaneRspack(options?: OctaneRspackPluginOptions): OctaneRspackPlugin;

/** Infer client/server compilation from standard Rspack target names. */
export declare function inferRspackEnvironment(target: unknown): OctaneRspackEnvironment;

/** Read the serializable metadata emitted by the loader for app-level collectors. */
export declare function getOctaneRspackBuildInfo(module: unknown): OctaneRspackBuildInfo | null;
