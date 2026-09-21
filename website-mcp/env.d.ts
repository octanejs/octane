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
		severity: 'warning' | 'error' | 'hint';
		message: string;
		filename: string;
		start: CompileDiagnosticPosition;
		end: CompileDiagnosticPosition;
		suggestions: Array<{
			start: CompileDiagnosticPosition;
			end: CompileDiagnosticPosition;
			attribute: 'onInput' | 'onInputCapture' | string;
		}>;
	}
	/** Serializable facts read from a `defineThemeTokens` module (U10, R5). */
	export interface TokenContractFacts {
		namespace: string;
		names: readonly string[];
	}
	export interface CompileOptions {
		mode?: 'client' | 'server';
		hmr?: boolean;
		dev?: boolean;
		autoMemo?: boolean;
		parallelUse?: boolean;
		/**
		 * facts = enforce; null = claimed but unreadable (unresolved warning);
		 * undefined = not a contract (silent).
		 */
		resolveTokenContract?: (
			request: string,
			importer: string,
		) => TokenContractFacts | readonly TokenContractFacts[] | null | undefined;
	}
	export function compile(
		source: string,
		id: string,
		options?: CompileOptions,
	): { code: string; map: unknown; diagnostics: CompileDiagnostic[] };
	export function createSyncTokenContractResolver(fs: {
		existsSync(path: string): boolean;
		readFileSync(path: string, encoding: 'utf8'): string;
	}): NonNullable<CompileOptions['resolveTokenContract']>;
}
