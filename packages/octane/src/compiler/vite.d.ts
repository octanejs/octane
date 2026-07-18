import type { Plugin } from 'vite';

export interface OctaneRendererRuleOptions {
	/** Glob or globs matched against canonical project-relative module IDs. */
	include: string | readonly string[];
	/** Optional glob or globs that remove files from this rule. */
	exclude?: string | readonly string[];
	/** Renderer alias declared in `registry`, or the built-in `dom` alias. */
	renderer: string;
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

export interface OctaneVitePluginOptions {
	/** Override HMR code generation. It defaults to on while Vite is serving. */
	hmr?: boolean;
	/** Force every transform to server (`true`) or client (`false`) code generation. */
	ssr?: boolean;
	/** Enable component profiling metadata in client transforms. */
	profile?: boolean;
	/**
	 * Path fragments excluded from Octane's plain `.ts`/`.js` hook-slot pass.
	 * Prefer package manifest `octane.hookSlots.manual` declarations for bindings.
	 */
	exclude?: string[];
	/**
	 * Compile project modules only when their directive prologue contains
	 * `'use octane'`. Installed Octane packages retain manifest-based ownership.
	 * @default false
	 */
	requireDirective?: boolean;
	/** @experimental Declarative renderer selection for this compiler instance. */
	renderers?: OctaneRendererConfigOptions;
}

/** The direct Octane compiler integration for Vite. */
export declare function octane(options?: OctaneVitePluginOptions): Plugin;

/** Discover raw-source Octane dependencies from the nearest owning package manifest. */
export declare function discoverOctaneSourceDependencies(projectRoot: string): string[];
