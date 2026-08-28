import type { Plugin } from 'vite';
import type { OctaneCssModuleConstants } from './index.js';

export type { OctaneCssModuleConstants } from './index.js';

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
	/** Explicit host tags that represent raw text and must obey `textParents`. */
	textHosts?: readonly string[];
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
			target?: 'dom' | 'universal' | 'valdi';
			server?: 'render' | 'client-only' | 'unsupported';
			intrinsics?: string;
			text?: 'reject' | 'ignore' | 'host';
			capabilities?: readonly string[];
			/** Host event prop names/prefixes replaced by first-screen listener sentinels. */
			firstScreenEvents?: readonly string[];
			/** Optional cold module that owns compiler-emitted thread-function helpers. */
			threadFunctionsModule?: string;
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

/** The fully transformed module in one Vite build environment. */
export interface OctaneCssModuleConstantModule {
	/** Exact bundler-resolved identity, including virtual prefixes and queries. */
	id: string;
	/** Final JavaScript; no application module is evaluated to obtain it. */
	code: string;
	meta: Readonly<Record<string, unknown>>;
	environment: 'client' | 'server';
}

export interface OctaneVitePluginOptions {
	/** Override HMR code generation. It defaults to on while Vite is serving. */
	hmr?: boolean;
	/** Force every transform to server (`true`) or client (`false`) code generation. */
	ssr?: boolean;
	/**
	 * Enable component profiling metadata in client transforms. `'auto'` enables
	 * it only while Vite is serving (dev), not in `vite build` — used by
	 * `@octanejs/vite-plugin`'s `devtools` option.
	 */
	profile?: boolean | 'auto';
	/**
	 * Assert pure immutable-snapshot renders and reject detectable state, ref,
	 * snapshot, and nondeterministic violations in application-owned modules.
	 * Individual modules can opt in with a top-level `"use strong"` directive.
	 * @default false
	 */
	strong?: boolean;
	/** Experimental native signal reads in DOM client/server render scopes. */
	nativeReads?: boolean;
	/**
	 * Path fragments excluded from Octane's plain `.ts`/`.js` hook-slot pass.
	 * Prefer package manifest `octane.hookSlots.manual` declarations for bindings.
	 */
	exclude?: string[];
	/**
	 * Mixed-toolchain ownership gate: project `.tsrx` modules stay Octane's
	 * by extension; a project `.tsx` compiles — and a plain project
	 * `.ts`/`.js` gets octane hook slotting — only with a leading
	 * `@jsxImportSource octane` pragma comment (a registered renderer's
	 * intrinsics module also counts). Installed Octane packages retain
	 * manifest-based ownership.
	 * @default false
	 */
	requireDirective?: boolean;
	/** @experimental Declarative renderer selection for this compiler instance. */
	renderers?: OctaneRendererConfigOptions;
	/**
	 * @experimental Authenticate immutable CSS-module exports supplied by a
	 * trusted CSS provider. Used only in one-shot production builds, never serve
	 * or watch. Values are checked against the exact final ESM; malformed or stale
	 * assertions fail the build. Returning null/undefined supplies no additional
	 * facts; built-in named-string proofs may still apply. This must not be used
	 * to declare mutable default maps constant.
	 */
	cssModuleConstants?: (
		module: OctaneCssModuleConstantModule,
	) => OctaneCssModuleConstants | null | undefined;
}

/** The direct Octane compiler integration for Vite. */
export declare function octane(options?: OctaneVitePluginOptions): Plugin;

/** Discover raw-source Octane dependencies from the nearest owning package manifest. */
export declare function discoverOctaneSourceDependencies(projectRoot: string): string[];
