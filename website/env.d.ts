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
		},
	): { code: string; map: unknown; diagnostics: CompileDiagnostic[] };
}

// `.mdx` documents compile (via @octanejs/mdx) to octane component modules with
// a default export and an optional `frontmatter` const.
declare module '*.mdx' {
	import type { OctaneNode } from 'octane';
	const MDXContent: (props?: Record<string, unknown>) => OctaneNode;
	export default MDXContent;
	export const frontmatter: Record<string, unknown>;
}
