// `octane/compiler` is authored in JSDoc'd JS with no shipped declarations —
// a minimal ambient surface for the entry points this package consumes.
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
		phase?: 'render' | 'purity' | 'effect' | 'cleanup';
		reportOnly?: boolean;
		declaration?: {
			hook: 'useState' | 'useReducer' | 'useActionState' | 'useOptimistic';
			name: string;
			start: CompileDiagnosticPosition;
			end: CompileDiagnosticPosition;
		};
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
			profile?: boolean;
			stateModel?: 'causal' | 'permissive';
		},
	): { code: string; map: unknown; diagnostics: CompileDiagnostic[] };
	export function __analyzeNativeChangeDiagnostics(
		ast: unknown,
		source: string,
		filename: string,
	): { diagnostics: CompileDiagnostic[]; classifications: Map<number, string> };
}
