// The octane_compile tool's engine: run the REAL octane compiler on pasted
// source and fold the thrown CompileError into a JSON-safe diagnostic. Pure
// (source in, result out) so it is unit-testable without MCP plumbing.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
	compile,
	createSyncTokenContractResolver,
	type CompileDiagnostic as CompilerWarning,
	type CompileOptions,
} from 'octane/compiler';
import octanePkg from '../../../packages/octane/package.json';

export interface CompileToolInput {
	source: string;
	filename: string;
	mode: 'client' | 'server';
	dev: boolean;
	autoMemo?: boolean;
	parallelUse?: boolean;
	/**
	 * Absolute project root anchoring relative imports to theme-token contract
	 * modules. Without it (or without an absolute `filename`) a claimed
	 * contract cannot be verified and reports `unresolved` rather than
	 * silently passing.
	 */
	projectRoot?: string;
}

export interface CompileDiagnostic {
	message: string;
	/** The diagnostic code the failure was thrown with, e.g. `tsrx-style-*`. */
	code?: string;
	line?: number;
	column?: number;
	pos?: number;
	/** A few source lines around the error with a caret under the column. */
	frame?: string;
}

export type CompileToolResult =
	| {
			ok: true;
			filename: string;
			mode: 'client' | 'server';
			octaneVersion: string;
			code: string;
			warnings: CompilerWarning[];
	  }
	| {
			ok: false;
			filename: string;
			mode: 'client' | 'server';
			octaneVersion: string;
			error: CompileDiagnostic;
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
		code?: string;
		pos?: number;
		loc?: { line?: number; column?: number; start?: { line: number; column: number } };
	};
	// CompileError carries an acorn-style location: either { start: {line,
	// column} } or a flat { line, column } depending on which layer raised it.
	const loc = raw.loc?.start ?? raw.loc;
	const diagnostic: CompileDiagnostic = { message: error.message };
	// The code is the diagnostic's identity for agents (docs search, analyze's
	// --code filter); dropping it orphans the error from both.
	if (typeof raw.code === 'string') diagnostic.code = raw.code;
	if (typeof raw.pos === 'number') diagnostic.pos = raw.pos;
	if (typeof loc?.line === 'number') {
		diagnostic.line = loc.line;
		diagnostic.column = typeof loc.column === 'number' ? loc.column : 0;
		diagnostic.frame = codeFrame(source, loc.line, diagnostic.column);
	}
	return diagnostic;
}

/**
 * The host-facts seam for theme-token contracts (U10, R5). With an anchor —
 * an absolute filename or `projectRoot` — authored contract modules are read
 * synchronously off disk. Without one there is no directory to resolve
 * against, so every candidate contract claim returns `null`: the compiler
 * reports `octane-style-token-contract-unresolved` and the references stay
 * honestly unverified instead of silently passing.
 */
function tokenContractResolver(
	projectRoot: string | undefined,
): CompileOptions['resolveTokenContract'] {
	const resolve = createSyncTokenContractResolver({ existsSync, readFileSync });
	return (request, importer) => {
		if (!isAbsolute(importer)) {
			if (projectRoot === undefined) return null;
			importer = join(projectRoot, importer);
		}
		return resolve(request, importer);
	};
}

export function runCompile(input: CompileToolInput): CompileToolResult {
	const { source, filename, mode, dev, autoMemo, parallelUse, projectRoot } = input;
	const base = { filename, mode, octaneVersion: octanePkg.version };
	try {
		const { code, diagnostics } = compile(source, filename, {
			mode,
			dev,
			autoMemo,
			parallelUse,
			resolveTokenContract: tokenContractResolver(projectRoot),
		});
		return { ok: true, ...base, code, warnings: diagnostics };
	} catch (error) {
		return { ok: false, ...base, error: toDiagnostic(error, source) };
	}
}
