// `octane/compiler` is authored in JSDoc'd JS with no shipped declarations —
// minimal ambient surface for the entry this app's config consumes (the same
// shape @octanejs/mdx declares locally in its own program; that sibling
// .d.ts isn't pulled in when packages/mdx/src is type-checked transitively
// from here, so the website program declares them itself).
declare module 'octane/compiler' {
	export interface CompileDiagnosticPosition {
		offset: number;
		line: number;
		column: number;
	}
	export interface CompileDiagnostic {
		code: string;
		severity: 'warning';
		message: string;
		filename: string;
		start: CompileDiagnosticPosition;
		end: CompileDiagnosticPosition;
		suggestions: Array<{
			start: CompileDiagnosticPosition;
			end: CompileDiagnosticPosition;
			attribute: 'onInput' | 'onInputCapture';
		}>;
	}
	export function compile(
		source: string,
		id: string,
		options?: {
			mode?: 'client' | 'server';
			hmr?: boolean;
			dev?: boolean;
			strong?: boolean;
			inspect?: boolean;
		},
	): {
		code: string;
		map: unknown;
		diagnostics: CompileDiagnostic[];
		// Opt-in (`inspect: true`) — the emitted code is byte-identical either
		// way. `segments` are the module print's map segments widened with the
		// authored source END a standard source map cannot carry; template
		// `origins` map spans of the baked HTML back to authored ranges.
		inspect?: {
			ast: unknown;
			templates: Array<{
				name: string | null;
				ast: unknown;
				html: string;
				// Server mode only: the exact bytes the printed module contains for
				// this run (SSR bakes its HTML inline instead of hoisting it).
				raw?: string;
				origins: Array<{
					start: number;
					end: number;
					srcStart: number;
					srcEnd: number;
					kind: string;
				}>;
			}>;
			aliases?: Array<{ srcStart: number; srcEnd: number; ofStart: number }>;
			segments: Array<{
				genLine: number;
				genCol: number;
				genEndCol: number | null;
				srcStart: number;
				srcEnd: number | null;
				exact?: boolean;
			}>;
		};
	};
}

// The Volar (language-service) pipeline — the playground's TYPES output pane.
declare module 'octane/compiler/volar' {
	export interface VolarMapping {
		sourceOffsets: number[];
		generatedOffsets: number[];
		lengths: number[];
		generatedLengths?: number[];
		data?: Record<string, unknown>;
	}
	// Navigation-only sibling of `compileToVolarMappings`: the same parse and
	// transform, with the directive-origin flag on, and WITHOUT the Volar
	// mapping layer. Nothing here reaches the language server.
	export function compileTypesInspection(
		source: string,
		filename?: string,
		options?: { renderers?: unknown },
	): {
		code: string;
		sourceAst: unknown;
		generatedAst: unknown;
		segments: Array<{
			genLine: number;
			genCol: number;
			genEndCol: number | null;
			srcStart: number;
			srcEnd: number | null;
			exact?: boolean;
		}>;
	};
	export function compileToVolarMappings(
		source: string,
		filename?: string,
		options?: {
			loose?: boolean;
			renderers?: unknown;
			strong?: boolean;
		},
	): {
		code: string;
		mappings: VolarMapping[];
		errors: readonly unknown[];
		diagnostics: readonly unknown[];
		sourceAst: unknown;
		generatedAst: unknown;
	};
}

// `.mdx` documents compile (via @octanejs/mdx) to octane component modules with
// a default export and an optional `frontmatter` const.
declare module '*.mdx' {
	import type { OctaneNode } from 'octane';
	const MDXContent: (props?: Record<string, unknown>) => OctaneNode;
	export default MDXContent;
	export const frontmatter: Record<string, unknown>;
}
