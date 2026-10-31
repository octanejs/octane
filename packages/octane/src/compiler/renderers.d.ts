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
	/** If provided, reject authored host tags outside this set. Component names are unaffected. */
	allowedTags?: readonly string[];
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

/** @experimental A registry entry with every default applied. */
export interface OctaneResolvedRendererEntry {
	readonly module: string;
	readonly target: 'dom' | 'universal' | 'valdi';
	readonly server: 'render' | 'client-only' | 'unsupported';
	readonly intrinsics?: string;
	readonly text: 'reject' | 'ignore' | 'host';
	readonly capabilities: readonly string[];
	readonly firstScreenEvents?: readonly string[];
	readonly threadFunctionsModule?: string;
	readonly validation?: Readonly<OctaneRendererValidationOptions>;
}

/** @experimental Canonical form used by compiler integrations and cache keys. */
export interface OctaneResolvedRendererConfig {
	readonly default: string;
	readonly registry: Readonly<Record<string, OctaneResolvedRendererEntry>>;
	readonly rules: readonly {
		readonly renderer: string;
		readonly include: readonly string[];
		readonly exclude: readonly string[];
	}[];
	readonly boundaries: Readonly<
		Record<string, Readonly<Record<string, Readonly<OctaneRendererBoundaryOptions>>>>
	>;
	readonly signature: string;
}

/** @experimental The registry entry selected for one module, with its alias. */
export interface OctaneResolvedRenderer extends OctaneResolvedRendererEntry {
	readonly id: string;
}

export const DOM_RENDERER_ID: 'dom';
export const DOM_RENDERER_MODULE: 'octane';
/** Versions the cache signature of a normalized configuration. */
export const RENDERER_CONFIG_VERSION: number;

/**
 * Validate and canonicalize renderer configuration. A normalized configuration
 * is accepted again unchanged in meaning.
 */
export function normalizeRendererConfig(
	input?: OctaneRendererConfigOptions | OctaneResolvedRendererConfig,
): OctaneResolvedRendererConfig;

/** Select the renderer for a canonical module ID; the first matching rule wins. */
export function resolveRendererForFile(
	config: OctaneRendererConfigOptions | OctaneResolvedRendererConfig,
	filename: string,
): OctaneResolvedRenderer;
