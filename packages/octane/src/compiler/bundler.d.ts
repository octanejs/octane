import type {
	CompileDiagnostic,
	CompileOptions,
	CompileResult,
	CompilerProgram,
	CompileSourceMap,
	OctaneCssModuleConstants,
} from './index.js';
import type {
	OctaneRendererConfigOptions,
	OctaneResolvedRenderer,
	OctaneResolvedRendererConfig,
} from './renderers.js';

export { DOM_BINDING_COMPILER_ABI_VERSION } from './index.js';
export {
	DOM_RENDERER_ID,
	DOM_RENDERER_MODULE,
	RENDERER_CONFIG_VERSION,
	normalizeRendererConfig,
	resolveRendererForFile,
} from './renderers.js';
export type {
	OctaneRendererConfigOptions,
	OctaneResolvedRenderer,
	OctaneResolvedRendererConfig,
} from './renderers.js';
export { findVoidComponentImports, findVoidRootImports } from './slot-hooks.js';
export type { VoidComponentImport } from './slot-hooks.js';

export type OctaneEnvironment = 'client' | 'server';

/** Options for one compiler instance; `transform` may override the per-module ones. */
export interface OctaneCompilerOptions extends Pick<
	CompileOptions,
	'knownAttributeSpreads' | 'domBindingFixedProps' | 'opaqueSignalHandles' | 'universalRuntime'
> {
	/** Project root for canonical module IDs and package-manifest discovery. @default process.cwd() */
	root?: string;
	/** @default 'client' */
	environment?: OctaneEnvironment;
	/** Opt into a typed compiler intermediate. The host emits JavaScript and composes maps. */
	output?: 'js' | 'ts';
	/** HMR code generation dialect; `true` means `'vite'`. Server transforms never emit HMR. */
	hmr?: boolean | 'vite' | 'webpack';
	/** Client development metadata. Defaults on whenever client HMR is on. */
	dev?: boolean;
	/** Component profiling metadata in client transforms. */
	profile?: boolean;
	/** @default true */
	inlineHookMemo?: boolean;
	/**
	 * Assert pure immutable-snapshot renders in application-owned modules.
	 * Individual modules can opt in with a top-level `"use strong"` directive.
	 * @default false
	 */
	strong?: boolean;
	/** Path fragments excluded from Octane's plain `.ts`/`.js` hook-slot pass. */
	exclude?: readonly string[];
	/**
	 * Mixed-toolchain ownership gate: a project `.tsx`, `.ts`, or `.js` module is
	 * Octane's only with a leading `@jsxImportSource octane` pragma.
	 * @default false
	 */
	requireDirective?: boolean;
	/** @experimental Declarative renderer selection for this compiler instance. */
	renderers?: OctaneRendererConfigOptions | OctaneResolvedRendererConfig;
	/** Receives ownership warnings and nonfatal compiler diagnostics, once per watch generation. */
	warn?: (message: string) => void;
}

export interface OctaneTransformOptions
	extends
		Pick<
			OctaneCompilerOptions,
			| 'environment'
			| 'output'
			| 'hmr'
			| 'dev'
			| 'profile'
			| 'inlineHookMemo'
			| 'strong'
			| 'knownAttributeSpreads'
			| 'domBindingFixedProps'
			| 'opaqueSignalHandles'
			| 'universalRuntime'
		>,
		Pick<
			CompileOptions,
			| 'textTypeFacts'
			| 'clientOnlyImports'
			| 'resolveCssModuleConstant'
			| 'preserveCssModuleReferences'
			| 'isVoidComponentImport'
			| 'isCompilerMemoImport'
			| 'isLiteComponentImport'
			| 'isStrongLiteComponentImport'
			| 'isAnchorlessComponentImport'
			| 'isDescriptorChildrenImport'
		> {
	/** Rewrite server runtime requests (`octane` to `octane/server`) in the output. */
	explicitRuntimeRequests?: boolean;
	/** Report `voidComponentExports` for a compiled client module. */
	collectVoidComponentExports?: boolean;
}

/** Manifests that decided a result; a host registers them as watch dependencies. */
export interface OctaneWatchDependencies {
	dependencies: string[];
	missingDependencies: string[];
}

/** Server-graph identity of a module owned by a client-only renderer. */
export interface OctaneClientReference {
	readonly id: string;
	readonly moduleId: string;
	readonly renderer: string;
}

export interface OctaneTransformResult
	extends
		OctaneWatchDependencies,
		Pick<
			CompileResult,
			'lang' | 'streamedSignals' | 'universalRuntime' | 'compilerMemoExports' | 'bindingConstants'
		> {
	code: string;
	map: CompileSourceMap | null;
	/**
	 * `compile`: full Octane compilation. `slots`: hook slotting of a plain
	 * module. `client-only-stub`: an export-preserving server stub.
	 * `runtime-requests`: only runtime requests were rewritten. `none`: the
	 * source is unchanged and returned only to report watch dependencies.
	 */
	kind: 'compile' | 'slots' | 'client-only-stub' | 'runtime-requests' | 'none';
	diagnostics?: readonly CompileDiagnostic[];
	renderer?: OctaneResolvedRenderer;
	clientReference?: OctaneClientReference;
	/** Export names of a client-only server stub. */
	clientOnlyExports?: readonly string[];
	/** The printed client-only server stub. */
	ast?: CompilerProgram;
	// Build-time metadata adapters publish to importers of this module.
	descriptorChildrenExports?: readonly string[];
	voidComponentExports?: readonly string[];
	liteComponentExports?: readonly string[];
	strongLiteComponentExports?: readonly string[];
	anchorlessComponentExports?: readonly string[];
	cssModuleConstantImports?: readonly unknown[];
	independentWidgets?: readonly unknown[];
}

export interface OctaneSourceDependencies extends OctaneWatchDependencies {
	/** Installed packages that ship Octane source, following their runtime dependencies. */
	packages: string[];
	/** Package IDs those packages ask Vite not to pre-bundle. */
	viteOptimizeDepsExclusions: string[];
}

/** The bundler-neutral compiler that every Octane bundler adapter drives. */
export interface OctaneCompiler {
	/**
	 * Compile or hook-slot one module, or return `null` when it passes through
	 * unchanged with no watch dependencies.
	 */
	transform(
		code: string,
		id: string,
		options?: OctaneTransformOptions,
	): OctaneTransformResult | null;
	/** Clear cached manifest decisions after a watched path changes, or all of them. */
	invalidate(path?: string | null): void;
	discoverSourceDependencies(): OctaneSourceDependencies;
	/** The privacy-safe source identity used by profiling metadata. */
	resolveProfileModuleId(id: string): OctaneWatchDependencies & { id: string };
	resolveRuntimeRequest(request: string, environment?: OctaneEnvironment): string | null;
	/** Static requests an adapter resolves before a server transform. */
	findServerImportRequests(code: string, id: string): string[];
	/** CSS-module requests the host may prove constant, behind the same ownership gate. */
	findCssModuleImportRequests(
		code: string,
		id: string,
		environment?: OctaneEnvironment,
		parsedAst?: CompilerProgram | null,
	): string[];
	/** Classify a bundler-resolved module without loading or evaluating it. */
	clientReferenceForFile(id: string): OctaneClientReference | null;
	/** How Strong mode reaches a module: its own directive, the `strong` option, or neither. */
	strongModuleStatus(
		code: string,
		id: string,
	): {
		strong: boolean;
		directive: boolean;
		config: boolean;
	};
	/** The package owning a module by its nearest manifest, and whether `transform` may change it. */
	modulePackage(
		code: string,
		id: string,
	): {
		name: string | null;
		root: string | null;
		compiled: boolean;
	};
}

export function createOctaneCompiler(options?: OctaneCompilerOptions): OctaneCompiler;

/** Discover raw-source Octane dependencies from the nearest owning package manifest. */
export function discoverOctaneSourceDependencies(projectRoot: string): string[];

export const OCTANE_RUNTIME_REQUESTS: Readonly<{ client: 'octane'; server: 'octane/server' }>;

/** The server or client runtime request for an Octane runtime import, or `null` for any other. */
export function resolveOctaneRuntimeRequest(
	request: string,
	environment: OctaneEnvironment,
): string | null;

/** Strip bundler query/hash suffixes without changing the underlying path. */
export function cleanModuleId(id: string): string;

/** The stable module ID embedded in compiler output: root-relative POSIX inside the root. */
export function canonicalModuleId(id: string, projectRoot?: string): string;

/** Whether an installed package reaches, through non-Octane packages, one Vite serves as CommonJS. */
export function packageReachesCommonJs(root: string): boolean;

/** Read the module specifier of a leading `@jsxImportSource` pragma. */
export function findLeadingJsxImportSourcePragma(code: string): string | null;

export const HYDRATE_QUERY_PARAM: 'octane-hydrate';
export const INDEPENDENT_HYDRATION_MANIFEST_FILENAME: 'octane-independent-hydration.json';

/** Direct function exports whose authored body never returns a renderable value. */
export function findVoidComponentExports(source: string | CompilerProgram, id: string): string[];

/** Facts about a module's final JavaScript after every bundler transform, or `null` if it does not parse. */
export function analyzeCompiledModule(
	source: string,
	id: string,
): {
	voidComponentExports: string[];
	/** `imported` is `default` or `*` for those import forms. */
	importBindings: { local: string; request: string; imported: string }[];
} | null;

export function findDescriptorChildrenExports(
	source: string | CompilerProgram,
	id: string,
): string[];

/** Imported components rendered as JSX or re-exported, as descriptor-children candidates. */
export function findDescriptorChildrenImports(
	source: string | CompilerProgram,
	id: string,
): { request: string; imported: string; local?: string; exported?: string }[];

export function isPlainCssModuleId(id: string): boolean;

/** A CSS provider's literal string exports, read without running it. */
export interface OctaneCssModuleExports {
	named: Map<string, string>;
	default: Map<string, string> | null;
	pure: boolean;
}

export function readCssModuleExports(
	source: string,
	options?: { allowPureVar?: boolean },
): OctaneCssModuleExports | null;

/** Validate a host assertion against the exact module it describes; throws when it does not hold. */
export function validateCssModuleConstants(
	provided: OctaneCssModuleConstants | null | undefined,
	exports: OctaneCssModuleExports | null,
	id: string,
	diagnosticOwner?: string,
): { named: Map<string, string>; default: Map<string, string> } | null;

/**
 * Fail-closed check of a `hydrate: 'islands'` shell: constructs that need
 * client work, and the imported components to check the same way.
 */
export function analyzeIslandsShell(
	source: string,
	filename: string,
	exports?: readonly string[] | null,
	options?: { values?: boolean },
): {
	problems: { message: string; line: number; column: number }[];
	components: { source: string; exportName: string; value?: true }[];
};

export const CLIENT_REFERENCE_MANIFEST_FILENAME: 'octane-client-references.json';
export const CLIENT_REFERENCE_MANIFEST_VERSION: 1;

/** Merge the chunks each adapter found for client references into one deterministic manifest. */
export function createClientReferenceManifest(
	entries:
		Iterable<{ reference: OctaneClientReference; chunks?: Iterable<string> }> | null | undefined,
): {
	version: typeof CLIENT_REFERENCE_MANIFEST_VERSION;
	references: Record<string, { moduleId: string; renderer: string; chunks: string[] }>;
};
