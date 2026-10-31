import type { Plugin } from 'vite';
import type { KnownAttributeSpread, OctaneCssModuleConstants } from './index.js';
import type { OctaneRendererConfigOptions } from './renderers.js';

export type { OctaneCssModuleConstants } from './index.js';
export type {
	OctaneRendererBoundaryOptions,
	OctaneRendererConfigOptions,
	OctaneRendererRegistryEntry,
	OctaneRendererRuleOptions,
	OctaneRendererValidationOptions,
} from './renderers.js';

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
	/** Opt into a typed compiler intermediate; Vite emits JavaScript with composed source maps. */
	output?: 'js' | 'ts';
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
	/** Trusted adapter output shapes; imported calls keep one evaluation per native host. */
	knownAttributeSpreads?: readonly KnownAttributeSpread[];
	/** Opt in to fixed primitive child props by name. Keep text and IDs live to share extracted programs. */
	domBindingFixedProps?: readonly string[];
	/**
	 * Bind signal handles that reach opaque holes in every module. By default
	 * only modules with an import from `octane/signals` (a type-only
	 * `SignalHandle` import is enough) do, so plain apps do not ship the signal
	 * binding runtime. Enable it for untyped components that render handles from
	 * a lazily loaded signals engine.
	 * @default false
	 */
	opaqueSignalHandles?: boolean;
	/**
	 * @experimental Infer primitive child text from a TypeScript project in
	 * one-shot production builds. Serve and watched builds retain syntax
	 * inference. A relative tsconfig is resolved from the Vite project root.
	 */
	textTypes?: { tsconfig: string };
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
