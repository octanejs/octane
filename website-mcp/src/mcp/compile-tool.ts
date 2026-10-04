// The octane_compile tool's engine: run the REAL octane compiler on pasted
// source and fold the thrown CompileError into a JSON-safe diagnostic. Pure
// (source in, result out) so it is unit-testable without MCP plumbing.
import {
	collectDiagnostics,
	compile,
	type CompileDiagnostic as CompilerWarning,
} from 'octane/compiler';
import { strongDiagnosticUrl } from '@octanejs/mcp-server/strong';
import octanePkg from '../../../packages/octane/package.json';

export interface CompileToolInput {
	source: string;
	filename: string;
	mode: 'client' | 'server';
	dev: boolean;
	strong?: boolean;
	autoMemo?: boolean;
	parallelUse?: boolean;
}

export interface CompileDiagnostic {
	message: string;
	line?: number;
	column?: number;
	pos?: number;
	/** A few source lines around the error with a caret under the column. */
	frame?: string;
	/** The diagnostic code, when the error carries one (Strong compiles). */
	code?: string;
	/** The code's documentation entry (Strong compiles). */
	url?: string;
}

/**
 * A compiler diagnostic from a Strong compile: the compiler's own fields
 * (code, severity, message, start/end, suggestions with optional source
 * edits), a caret frame, and the docs entry for a catalogued code.
 */
export type StrongFinding = CompilerWarning & { frame: string; url?: string };

export type CompileToolResult =
	| {
			ok: true;
			filename: string;
			mode: 'client' | 'server';
			octaneVersion: string;
			code: string;
			/** Strong compiles return {@link StrongFinding}s here. */
			warnings: Array<CompilerWarning | StrongFinding>;
	  }
	| {
			ok: false;
			filename: string;
			mode: 'client' | 'server';
			octaneVersion: string;
			/** The error compilation stopped at. */
			error: CompileDiagnostic;
			/** Strong compiles only: every finding in the module, by position. */
			diagnostics?: StrongFinding[];
	  };

function codeFrame(source: string, line: number, column: number): string {
	const lines = source.split('\n');
	const first = Math.max(0, line - 3);
	const last = Math.min(lines.length, line + 2);
	const width = String(last).length;
	const out: string[] = [];
	for (let i = first; i < last; i++) {
		out.push(`${String(i + 1).padStart(width)} | ${lines[i]}`);
		if (i + 1 === line) out.push(`${' '.repeat(width)} | ${' '.repeat(Math.max(0, column))}^`);
	}
	return out.join('\n');
}

function toDiagnostic(error: unknown, source: string): CompileDiagnostic {
	if (!(error instanceof Error)) return { message: String(error) };
	const raw = error as Error & {
		pos?: number;
		loc?: { line?: number; column?: number; start?: { line: number; column: number } };
	};
	// CompileError carries an acorn-style location: either { start: {line,
	// column} } or a flat { line, column } depending on which layer raised it.
	const loc = raw.loc?.start ?? raw.loc;
	const diagnostic: CompileDiagnostic = { message: error.message };
	if (typeof raw.pos === 'number') diagnostic.pos = raw.pos;
	if (typeof loc?.line === 'number') {
		diagnostic.line = loc.line;
		diagnostic.column = typeof loc.column === 'number' ? loc.column : 0;
		diagnostic.frame = codeFrame(source, loc.line, diagnostic.column);
	}
	return diagnostic;
}

function toFinding(diagnostic: CompilerWarning, source: string): StrongFinding {
	const url = strongDiagnosticUrl(diagnostic.code);
	return {
		...diagnostic,
		frame: codeFrame(source, diagnostic.start.line, diagnostic.start.column),
		...(url ? { url } : {}),
	};
}

// The compiler's own gate: Strong analysis runs for the option or for any
// module whose text contains the directive, including a misplaced one, which
// it reports.
function strongRequested(input: CompileToolInput): boolean {
	return input.strong === true || input.source.includes('use strong');
}

// compile() stops at the first Strong error. A migrating agent needs every
// finding at once, so a failed Strong compile also collects the rest.
function runStrongCompile(
	input: CompileToolInput,
	base: { filename: string; mode: 'client' | 'server'; octaneVersion: string },
): CompileToolResult {
	const { source, filename, mode, dev, autoMemo, parallelUse } = input;
	const options = { mode, dev, autoMemo, parallelUse, ...(input.strong ? { strong: true } : {}) };
	try {
		const { code, diagnostics } = compile(source, filename, options);
		return {
			ok: true,
			...base,
			code,
			warnings: diagnostics.map((diagnostic) => toFinding(diagnostic, source)),
		};
	} catch (thrown) {
		const error = toDiagnostic(thrown, source);
		const code = (thrown as { code?: unknown } | null)?.code;
		if (typeof code === 'string') {
			error.code = code;
			const url = strongDiagnosticUrl(code);
			if (url) error.url = url;
		}
		let collected: CompilerWarning[] = [];
		try {
			collected = collectDiagnostics(source, filename, options).diagnostics;
		} catch {
			// The thrown error above already describes the failure.
		}
		const diagnostics = collected
			.map((diagnostic) => toFinding(diagnostic, source))
			.sort((a, b) => a.start.offset - b.start.offset);
		return { ok: false, ...base, error, diagnostics };
	}
}

export function runCompile(input: CompileToolInput): CompileToolResult {
	const { source, filename, mode, dev, autoMemo, parallelUse } = input;
	const base = { filename, mode, octaneVersion: octanePkg.version };
	if (strongRequested(input)) return runStrongCompile(input, base);
	try {
		const { code, diagnostics } = compile(source, filename, {
			mode,
			dev,
			autoMemo,
			parallelUse,
		});
		return { ok: true, ...base, code, warnings: diagnostics };
	} catch (error) {
		return { ok: false, ...base, error: toDiagnostic(error, source) };
	}
}
