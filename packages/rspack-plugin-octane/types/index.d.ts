import type { Compiler, RspackPluginInstance } from '@rspack/core';

export type OctaneRspackEnvironment = 'client' | 'server';

export interface OctaneRspackLoaderOptions {
	/** Project root used to canonicalize module IDs and discover package manifests. */
	root?: string;
	/** Explicit compiler target. Standard Rspack web/node targets are inferred when omitted. */
	environment?: OctaneRspackEnvironment;
	/** Allow webpack-dialect HMR codegen when the loader context is hot. Default `true`. */
	hmr?: boolean;
	/** Emit client development metadata. Defaults to Rspack's non-production mode. */
	dev?: boolean;
	/** Enable Octane's parallel `use()` compilation pipeline. Default `true`. */
	parallelUse?: boolean;
	/** Path fragments excluded from the plain `.ts`/`.js` hook-slot pass. */
	exclude?: string[];
}

export interface OctaneRspackPluginOptions extends OctaneRspackLoaderOptions {
	/**
	 * Add Rspack's built-in SWC loader to strip TypeScript after Octane runs.
	 * Disable this when another rule already owns TypeScript transpilation.
	 * @default true
	 */
	transpile?: boolean;
}

export interface OctaneRspackBuildInfo {
	canonicalId: string;
	transformKind: 'compile' | 'slots';
	serverRpc: boolean;
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
