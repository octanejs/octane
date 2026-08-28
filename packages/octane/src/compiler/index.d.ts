import type { CodeInformation, Mapping } from '@volar/language-core';
import type { TextTypeFacts } from './typescript.js';

export type { TextTypeFacts } from './typescript.js';

export interface CompileRenderer {
	id: string;
	module: string;
	target: 'dom' | 'universal' | 'valdi';
	server?: string;
	/** Additional normalized renderer capabilities. */
	[option: string]: unknown;
}

export interface CompileRendererBoundary {
	ownerRenderer: string;
	childRenderer: string;
	prop: string;
	server?: string;
}

/**
 * An explicit provider guarantee, checked against the final module's literal
 * exports. Each supplied value must already be initialized and remain the same
 * string for every read. `default` requires own immutable data properties; an
 * ordinary mutable CSS-module default object does not satisfy that contract.
 */
export interface OctaneCssModuleConstants {
	named?: Readonly<Record<string, string>>;
	default?: Readonly<Record<string, string>>;
}

/** The version checked by compiler-emitted external Valdi adapter calls. */
export const VALDI_COMPILER_ABI_VERSION: 1;

export type ValdiWriterEffectiveType = 'boolean' | 'number' | 'string' | 'function' | 'style';

/** An exact authored-expression fact supplied by an integration's type checker. */
export interface ValdiWriterExpressionFact {
	/** UTF-16 source offset, inclusive. */
	start: number;
	/** UTF-16 source offset, exclusive. */
	end: number;
	effectiveType: ValdiWriterEffectiveType;
	/** Typed adapter setters must also accept and clear nullish values. */
	isNullable: boolean;
}

export interface ValdiWriterFacts {
	version: 1;
	expressions: readonly ValdiWriterExpressionFact[];
}

export interface CompileOptions {
	mode?: 'client' | 'server';
	hmr?: boolean | 'vite' | 'webpack';
	dev?: boolean;
	/** Assert pure immutable-snapshot renders, enable bounded checks, and trust production call memoization. */
	strong?: boolean;
	/** Experimental native signal reads in DOM client/server render scopes. */
	nativeReads?: boolean;
	profile?: boolean;
	profileFilename?: string;
	/** Include out-of-band source-origin inspection data. */
	inspect?: boolean;
	/** Diagnostic escape hatches for production compiler memoization. */
	autoMemo?: boolean;
	inlineHookMemo?: boolean;
	dataCallbackHooks?: readonly string[];
	/** Exact authored-source facts from octane/compiler/typescript. */
	textTypeFacts?: TextTypeFacts;
	/** Optional exact attribute-expression proofs; used only by the Valdi target. */
	valdiWriterFacts?: ValdiWriterFacts;
	/**
	 * Trusted bundler/provider proof of an already initialized, immutable CSS
	 * class string. `property` is null for a named string import, or the static
	 * member name for a default/namespace import. Returning undefined leaves the
	 * expression dynamic. The host must preserve the stylesheet's side effects.
	 */
	resolveCssModuleConstant?: (
		request: string,
		imported: string,
		property: string | null,
	) => string | undefined;
	/**
	 * CSS modules whose extraction depends on retaining a live export. Keep one
	 * original class read in each static host subtree that uses such a module;
	 * unused/lazy component styles then retain their normal bundler ownership.
	 */
	preserveCssModuleReferences?: readonly string[];
	renderer?: CompileRenderer;
	rendererBoundaries?: Readonly<Record<string, Readonly<Record<string, CompileRendererBoundary>>>>;
	rendererRegistry?: Readonly<
		Record<string, { module: string; target: 'dom' | 'universal' | 'valdi'; server?: string }>
	>;
	universalRuntime?: { runtime: string; thread: 'background' | 'main-thread' };
	clientOnlyImports?: readonly unknown[];
	isVoidComponentImport?: (request: string, imported: string) => boolean;
	isDescriptorChildrenImport?: (request: string, imported: string) => boolean;
	/** Preserve the compiler's existing experimental integration options. */
	[option: string]: unknown;
}

export interface CompilePosition {
	offset: number;
	line: number;
	column: number;
}

export interface CompileDiagnostic {
	code: string;
	severity: 'warning' | 'error';
	message: string;
	filename: string;
	start: CompilePosition;
	end: CompilePosition;
	suggestions?: readonly {
		start: CompilePosition;
		end: CompilePosition;
		attribute: string;
	}[];
}

export interface CompileSourceMap {
	version: number;
	sources: string[];
	sourcesContent?: (string | null)[];
	names: string[];
	mappings: string;
	file?: string;
	sourceRoot?: string;
}

/** Parser-specific node fields remain opaque to ordinary compiler consumers. */
export interface CompilerAstNode {
	type: string;
	start?: number;
	end?: number;
	loc?: {
		start: { line: number; column: number };
		end: { line: number; column: number };
	} | null;
	[field: string]: unknown;
}

export interface CompilerProgram extends CompilerAstNode {
	type: 'Program';
	sourceType: 'script' | 'module';
	body: CompilerAstNode[];
}

export interface CompileParseError extends Error {
	code?: string;
	pos?: number;
	raisedAt?: number;
	end?: number;
	loc?: CompilerAstNode['loc'];
	fileName: string | null;
	type: 'fatal' | 'usage';
}

export type CompileCodeMapping = Mapping<
	CodeInformation & { customData: Record<string, unknown> }
> & { generatedLengths: number[] };

export interface VolarCompileResult {
	code: string;
	mappings: CompileCodeMapping[];
	cssMappings: CompileCodeMapping[];
	scriptMappings: CompileCodeMapping[];
	errors: CompileParseError[];
	sourceAst: CompilerProgram;
	generatedAst: CompilerProgram;
	diagnostics: readonly CompileDiagnostic[];
}

export interface CompileInspection {
	ast: CompilerProgram;
	templates: {
		name: string | null;
		ast: unknown;
		html: string;
		raw?: string;
		origins: {
			start: number;
			end: number;
			srcStart: number;
			srcEnd: number;
			kind: string;
		}[];
	}[];
	segments: {
		genLine: number;
		genCol: number;
		genEndCol: number | null;
		srcStart: number;
		srcEnd: number | null;
	}[];
	aliases: { srcStart: number; srcEnd: number; ofStart: number }[];
}

export interface CompileResult {
	code: string;
	map: CompileSourceMap;
	diagnostics: readonly CompileDiagnostic[];
	inspect?: CompileInspection;
	universalRuntime?: CompileOptions['universalRuntime'];
}

/** Compile authored TSRX/JSX to Octane client or server JavaScript. */
export function compile(
	source: string,
	filename: string,
	options: CompileOptions & { inspect: true },
): CompileResult & { inspect: CompileInspection };
export function compile(source: string, filename: string, options?: CompileOptions): CompileResult;

/** Produce typed virtual TSX and authored-source mappings for language tooling. */
export function compileToVolarMappings(
	source: string,
	filename?: string,
	options?: { loose?: boolean; renderers?: unknown; strong?: boolean; nativeReads?: boolean },
): VolarCompileResult;

/** @internal Shared authored-JSX diagnostic analysis for compiler integrations. */
export function __analyzeNativeChangeDiagnostics(
	ast: { type: string; body?: readonly unknown[] },
	source: string,
	filename?: string,
	options?: Pick<CompileOptions, 'renderer' | 'rendererBoundaries' | 'rendererRegistry'> & {
		dom?: boolean;
	},
): {
	diagnostics: CompileDiagnostic[];
	classifications: Map<number, 'safe' | 'runtime-check' | 'statically-warned'>;
};
