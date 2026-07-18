// `@octanejs/mcp-server` is authored in plain JS with no shipped declarations —
// a minimal ambient surface for the knowledge exports this app consumes.
declare module '@octanejs/mcp-server/bridge' {
	export const KNOWN_BINDINGS: Record<string, string>;
	export interface BridgeApiRow {
		name: string;
		count: number;
		status: 'same' | 'partial' | 'rewrite' | 'unsupported';
		note: string;
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

// `octane/compiler` is authored in JSDoc'd JS with no shipped declarations —
// a minimal ambient surface for the options the octane_compile tool exposes
// (mirrors website/env.d.ts, which declares the same module for its config).
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
			autoMemo?: boolean;
			parallelUse?: boolean;
		},
	): { code: string; map: unknown; diagnostics: CompileDiagnostic[] };
}
