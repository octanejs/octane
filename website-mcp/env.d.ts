// `@octanejs/mcp-server` is authored in plain JS with no shipped declarations —
// a minimal ambient surface for the knowledge exports this app consumes.
declare module '@octanejs/mcp-server/bridge' {
	export const KNOWN_BINDINGS: Record<string, string>;
	export interface BridgeApiRow {
		name: string;
		count: number;
		status: 'same' | 'partial' | 'rewrite' | 'unsupported';
		note: string;
		/** The replacement for the API's usual React idiom in a Strong module. */
		strong?: string;
	}
	export interface BridgeSourceReport {
		target: string;
		existingBinding: string | null;
		vanillaCore?: string | null;
		reactImports: string[];
		classComponents: boolean;
		apis: BridgeApiRow[];
		verdict: 'bridgeable' | 'bridgeable-with-rewrites' | 'needs-rework';
		plan: string[];
	}
	export function bridgeReportFromSource(
		source: string,
		options?: { packageName?: string },
	): BridgeSourceReport;
}

declare module '@octanejs/mcp-server/strong' {
	export interface StrongCatalogDiagnostic {
		code: string;
		section: string;
		severity: 'error' | 'hint';
		detects: string;
		replacement: string;
		primitives?: string[];
		url: string;
	}
	export interface StrongCatalogRecipe {
		id: string;
		title: string;
		react: string;
		strong: string;
		codes: string[];
		before: string;
		after: string;
		note: string;
	}
	export const STRONG_CATALOG: {
		docsUrl: string;
		sections: Array<{ id: string; title: string }>;
		diagnostics: StrongCatalogDiagnostic[];
		recipes: StrongCatalogRecipe[];
	};
	export const STRONG_EXPLAIN_TOOL: {
		name: string;
		title: string;
		description: string;
		codeDescription: string;
		recipeDescription: string;
	};
	export function explainStrong(input?: { code?: string; recipe?: string }): {
		ok: boolean;
		text: string;
	};
	export function strongDiagnosticUrl(code: string): string | undefined;
	export function strongRecipeUrl(id: string): string;
	export function resolveStrongCode(input: string): string | null;
	export function closeStrongCodes(input: string, limit?: number): string[];
}

// `octane/compiler` is authored in JSDoc'd JS with no shipped declarations —
// a minimal ambient surface for the options the octane_compile tool exposes
// (mirrors website/env.d.ts, which declares the same module for its config).
declare module 'octane/compiler' {
	export interface CompileDiagnosticPosition {
		offset: number;
		line: number;
		column: number;
	}
	/** A source replacement, as offsets into the module text the compiler received. */
	export interface CompileEdit {
		start: number;
		end: number;
		text: string;
	}
	/** How to resolve a diagnostic; `edits` apply together or not at all. */
	export interface CompileSuggestion {
		message: string;
		hook?: string;
		edits?: CompileEdit[];
	}
	export interface CompileAttributeSuggestion {
		start: CompileDiagnosticPosition;
		end: CompileDiagnosticPosition;
		attribute: 'onInput' | 'onInputCapture';
	}
	export interface CompileDiagnostic {
		code: string;
		severity: 'warning' | 'error' | 'hint';
		message: string;
		filename: string;
		start: CompileDiagnosticPosition;
		end: CompileDiagnosticPosition;
		suggestions: Array<CompileSuggestion | CompileAttributeSuggestion>;
	}
	export interface CompileOptions {
		mode?: 'client' | 'server';
		hmr?: boolean;
		dev?: boolean;
		strong?: boolean;
		autoMemo?: boolean;
		parallelUse?: boolean;
	}
	export function compile(
		source: string,
		id: string,
		options?: CompileOptions,
	): { code: string; map: unknown; diagnostics: CompileDiagnostic[] };
	/** Every diagnostic for one module; Strong errors do not stop at the first. */
	export function collectDiagnostics(
		source: string,
		filename: string,
		options?: CompileOptions,
	): { diagnostics: CompileDiagnostic[]; error: unknown };
}
