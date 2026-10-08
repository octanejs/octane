/** Source-bound, serializable primitive-text proofs for JSX child holes. */
export interface TextTypeFacts {
	readonly version: 1;
	/** Clean absolute filename, with forward-slash separators. */
	readonly filename: string;
	/** Digest of every authored UTF-16 code unit, including line endings. */
	readonly sourceVersion: string;
	/** Identifies the TypeScript options and source graph used for this proof. */
	readonly projectVersion: string;
	/** Sorted, unique, half-open UTF-16 ranges of authored child expressions. */
	readonly stringChildRanges: readonly (readonly [start: number, end: number])[];
	/**
	 * Number, bigint, and mixed string/number/bigint children. Older version-1
	 * snapshots omit this field and retain their string-only behavior.
	 */
	readonly primitiveTextChildRanges?: readonly (readonly [start: number, end: number])[];
}

export interface TextTypeProjectOptions {
	/** Path to the consumer tsconfig. Relative paths resolve from the process cwd. */
	tsconfig: string;
	/** Root for project-relative renderer module IDs; defaults to the tsconfig directory. */
	root?: string;
	/** The same renderer configuration used by the Octane compiler. */
	renderers?: unknown;
	/** The same native attribute contracts used by runtime compilation. */
	knownAttributeSpreads?: readonly import('./index.js').KnownAttributeSpread[];
	/**
	 * The TypeScript to analyze with: a package name, resolved from the tsconfig
	 * directory (for example an aliased `typescript-native` install), or the
	 * absolute path of a package directory. Defaults to octane's `typescript`
	 * peer. TypeScript 5.9 and 6 run on the classic compiler API, TypeScript 7.1
	 * and later on its native `typescript/unstable/sync` API.
	 */
	typescript?: string;
}

export interface TextTypeProject {
	/**
	 * Return immutable facts for a .tsrx or .tsx file. Relative filenames resolve
	 * from the tsconfig directory. An optional source is an authoritative in-memory
	 * override until that file, or the whole project, is invalidated.
	 *
	 * The project uses strict null checking only when the consumer enables it and
	 * always enables noUncheckedIndexedAccess for this analysis. Unproven, unsafe,
	 * erroneous, or ambiguously mapped expressions are omitted. These facts trust
	 * TypeScript declarations; they do not validate runtime values.
	 */
	snapshot(filename: string, source?: string): TextTypeFacts;
	/**
	 * Discard a changed file's cached source/override and all semantic proofs.
	 * Without a filename, discard every cached source/override. Both forms reload
	 * the tsconfig and project roots before the next snapshot. No watcher is started.
	 */
	invalidate(filename?: string): void;
	/** Release the language service and retained source graph. Idempotent. */
	dispose(): void;
}

/**
 * Create an explicit, Node-only TypeScript project for Octane child-text facts.
 * Requires the optional TypeScript peer (or `typescript`). Reuse one instance
 * across a build and pass the same snapshot to client and server compilation.
 * On TypeScript 7 the project owns a native compiler process until `dispose`.
 */
export function createTextTypeProject(options: TextTypeProjectOptions): TextTypeProject;

/**
 * The parts of a classic (TypeScript 5.9 or 6) `Program` this entry relies on,
 * declared structurally: a consumer whose `typescript` is TypeScript 7 resolves
 * `import('typescript')` to a root that exports only its version.
 */
export interface ClassicTypeScriptProgram {
	getTypeChecker(): unknown;
	getSourceFile(fileName: string): { readonly fileName: string } | undefined;
}

/**
 * The parts of a TypeScript 7 `Program` (from `typescript/unstable/sync`) this
 * entry relies on, declared structurally so the declaration does not require
 * TypeScript 7's types.
 */
export interface NativeTypeScriptProgram {
	getProject(): { readonly checker: unknown };
	getSourceFile(file: string): { readonly fileName: string } | undefined;
	getSourceFileNames(): readonly string[];
}

export interface NativeSignalValidationOptions {
	/**
	 * The TypeScript whose API created `program`: a package name resolved from
	 * the working directory, or the absolute path of a package directory.
	 * Defaults to octane's `typescript` peer.
	 */
	typescript?: string;
}

/**
 * Validate native signal names and known live reads in ordinary memo callbacks
 * against the exact SourceFile in an existing TypeScript Program, either a
 * classic Program or a TypeScript 7 Program. The caller owns project lifetime
 * and mapping diagnostics from virtual .tsrx files. Resolves the native
 * SIGNAL_HANDLE brand by symbol; unrelated structural shapes and ordinary
 * sampled values are not native capabilities.
 */
export function validateNativeSignalNames(
	program: ClassicTypeScriptProgram | NativeTypeScriptProgram,
	file: string | { readonly fileName: string },
	options?: NativeSignalValidationOptions,
): import('./index.js').CompileDiagnostic[];
