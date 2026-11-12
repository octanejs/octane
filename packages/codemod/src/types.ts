import type ts from 'typescript';

export interface Note {
	rule: string;
	severity: 'info' | 'warning' | 'error';
	line: number;
	message: string;
}
export interface TransformOptions {
	/** Try receiver captures for a Strong effect with an explicit object dependency. */
	captureEffectReceivers?: boolean;
	/** Also preserve eligible property triggers at the original effect statement. */
	snapshotEffectProperties?: boolean;
	captureEffectSnapshots?: boolean;
	/** `tsrx` (default) rewrites component bodies as templates; `tsx` keeps JSX and only ports the React APIs. */
	target?: 'tsx' | 'tsrx';
	/** Emit Strong-mode source: add `"use strong"` and leave omitted dependency lists to the compiler. */
	strong?: boolean;
	/** The project checks with `strictNullChecks`, so TypeScript types can prove text holes and boolean guards. */
	strictNullChecks?: boolean;
	/** This module in a program over the whole project, whose resolved imports type what the module's own program cannot. */
	types?: { sourceFile: ts.SourceFile; checker: ts.TypeChecker };
	/** The new spelling of an import specifier (a renamed module, a binding package), or null to keep it. */
	resolveSpecifier?(specifier: string): string | null;
	/** Resolve a source-backed workspace hook after verifying its implementation and its call sites. */
	resolveStoreHook?(
		module: string,
		name: string,
		safeUses: (
			sharedInput: (module: string, name: string) => boolean | 'opaque',
			unchangedHelper?: (module: string, name: string) => boolean,
		) => boolean,
	): { from: string; name: string } | null;
	/** Relative path to the project-local React Intl adapter, when its installed peers support it. */
	reactIntlAdapter?: string;
	/** Whether a directly imported, selected component forwards this prop only to text attributes. */
	forwardedText?(
		module: string,
		exported: string,
		prop: string,
		ordinaryCaller?: boolean,
		through?: boolean,
	): boolean;
	/** Whether the selected component at this local declaration offset, or this imported name, accepts one explicit element. */
	elementChild?(binding: number | { module: string; imported: string }): boolean;
	/** Whether a selected, directly imported component inspects its child descriptors. */
	descriptorChild?(binding: { module: string; imported: string }): boolean;
	/** Whether an imported name is a context, or null when it cannot be known. */
	isContext?(specifier: string, name: string): boolean | null;
	/** The React package an import specifier names when that package has no Octane port, or null. */
	unported?(specifier: string): string | null;
	/** The project has React and React DOM 19.2 or newer in the React 19 series, so `ReactCompat` can host an unported package's components. */
	reactCompat?: boolean;
	/** Both installed Octane entry points support inline React islands. */
	reactCompatInline?: boolean;
	/** The selected imported component renders every use of this prop directly in native output. */
	forwardedRender?(module: string, exported: string, prop: string, depth: number): boolean;
	/** The file imports the installed clsx package through its original entry point. */
	installedClsx?: boolean;
	/** The physical CSS Modules stylesheet for a plain relative request, if present. */
	cssModuleFile?(specifier: string): string | undefined;
	/** The generated native SVG helper, if the project verified this raw asset. */
	pathSvgAdapter?(specifier: string): string | null;
	/** With pathSvgAdapter, supplies a native SVG adapter with the requested fixed root color. */
	fixedColorSvgAdapter?(specifier: string, color: string): string | null;
	/** This file uses React's automatic JSX runtime and the component resolves to its original React package. */
	reactStoreComponent?(specifier: string): boolean;
}
/** A React package with no Octane port, and how migrated code uses it. */
export interface Unported {
	name: string;
	/** Elements now rendered in a `ReactCompat` island. */
	islands: number;
	/** Uses that only a port can support. */
	blocked: number;
}
export interface TransformResult {
	code: string;
	changed: boolean;
	/** Whether the module becomes `.tsrx`: it holds a template, keeps JSX, or was a JSX module, so no `.tsx` module is left outside Strong mode's reach. */
	template: boolean;
	notes: Note[];
	/** How often each rule fired. */
	rules: Record<string, number>;
	/** What the module exports that other modules' rewrites depend on. */
	exports: {
		elementChildren?: { start: number; exported?: string }[];
		descriptorChildren?: string[];
		contexts: string[];
		reexports: { specifier: string; names: [string, string][] | null }[];
	};
	unported: Unported[];
}
export interface CodemodOptions {
	/** Bare SVG components render the authored geometry and ?raw loads the same asset as text. */
	svgPaths?: boolean;
	target?: 'tsrx' | 'tsx';
	/** Migrate to Strong mode where the compiler accepts it, falling back to compatibility mode per module. */
	strong?: boolean;
	/** Keep `"use strong"` even on modules with Strong errors left. */
	forceStrong?: boolean;
	/** Compile every migrated module (default true). */
	verify?: boolean;
	/** Resolve types through the project graph (default true). False uses only module-local type information. */
	projectTypes?: boolean;
	/** Write the result to disk (default true). */
	write?: boolean;
	/** The project root, for resolving its compiler. */
	root?: string;
}
export interface Finding {
	code: string;
	severity: string;
	message: string;
	line: number;
}
export interface Compiler {
	/** Where the compiler was loaded. */
	from: string;
	collectDiagnostics: typeof import('octane/compiler').collectDiagnostics;
}
export interface FileResult {
	/** The module's path, relative to the root. */
	file: string;
	/** Where it is written, relative to the root. */
	output: string;
	changed: boolean;
	rules: Record<string, number>;
	/** The codemod's own findings, at the original file's lines. */
	notes: Note[];
	/** Whether it is Strong, or null when Strong was not requested or does not apply. */
	strong: boolean | null;
	strongFixes: string[];
	/** What the compiler reported for the migrated module. */
	diagnostics: Finding[];
	code: string;
}
export interface CodemodResult {
	root: string;
	files: FileResult[];
	/** React packages the migrated code now imports as Octane bindings. */
	packages: { from: string; to: string }[];
	/** Bindings added to package.json, which the project did not declare. */
	dependencies: { name: string; range: string }[];
	/** Patches of replaced React packages, which do not reach their bindings. */
	patched: { name: string; patch: string }[];
	/** React packages the code imports that have no Octane port, and how it uses them. */
	missing: (Unported & { modules: number })[];
	/** Entry pages whose script reference was updated. */
	html: string[];
	/** Where the verifying compiler came from. */
	compiler: string | null;
}
export interface StrongResult {
	/** The module after every fix the compiler allowed. */
	code: string;
	/** Whether it kept `"use strong"`. */
	strong: boolean;
	/** The diagnostic codes a fix resolved. */
	fixed: string[];
	/** The Strong errors left, when it did not. */
	blockers: Finding[];
}

/** A named import used by the scoped signal source or its destination adapter. */
export interface ScopedSignalBinding {
	module: string;
	name: string;
}
export interface ScopedSignalOptions {
	sourceRoot: string;
	tsconfig: string;
	sourceModule: string;
	scope: ScopedSignalBinding;
	factory: ScopedSignalBinding;
	reader: ScopedSignalBinding;
	/** Source-root-relative paths and reviewed SHA-256 hashes of imperative consumers. */
	reviewedAccess?: Record<string, string>;
}
