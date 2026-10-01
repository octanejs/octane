import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import * as ServerHelpers from 'octane/internal/server';

// Shared by the Strong repair graders. A task in this family starts from a
// `"use strong"` module that the compiler rejects; a passing answer must compile
// under Strong mode AND remove the behavior the diagnostic predicts.

export const STRONG_COMPILE_TEST = 'compiles in Strong mode';

const tasksRoot = join(dirname(fileURLToPath(import.meta.url)), 'tasks');

export function submissionSource(taskId: string): string {
	const root = process.env.OCTANE_EVAL_SUBMISSION_ROOT;
	return readFileSync(
		root
			? resolve(root, taskId, 'src', 'App.tsrx')
			: join(tasksRoot, taskId, 'reference', 'src', 'App.tsrx'),
		'utf8',
	);
}

/**
 * Strong applies to the submission however it is spelled. Deleting the
 * directive does not opt out: the grader compiles with `strong: true`.
 */
export function strongCompileErrors(source: string): string[] {
	const errors: string[] = [];
	for (const mode of ['client', 'server'] as const) {
		try {
			compile(source, 'App.tsrx', { mode, strong: true } as any);
		} catch (error) {
			errors.push(`${mode}: ${(error as Error).message}`);
		}
	}
	return errors;
}

export function expectStrongCompile(source: string): void {
	expect(strongCompileErrors(source)).toEqual([]);
}

/** Evaluate the Strong server build of a submission. */
export function serverModule(source: string): Record<string, any> {
	const { code } = compile(source, 'App.tsrx', { mode: 'server', strong: true } as any);
	const commonJs = ts.transpileModule(code, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext },
	}).outputText;
	const module = { exports: {} as Record<string, any> };
	const requireServerRuntime = (specifier: string) => {
		if (specifier === 'octane/server' || specifier === 'octane') return ServerRuntime;
		if (specifier === 'octane/internal/server') return ServerHelpers;
		throw new Error(`Unsupported server-eval import: ${specifier}`);
	};
	new Function('require', 'module', 'exports', commonJs)(
		requireServerRuntime,
		module,
		module.exports,
	);
	return module.exports;
}

export function serverHTML(source: string, props: Record<string, unknown> = {}): string {
	return ServerRuntime.renderToString(serverModule(source).App, props).html;
}
