/**
 * Shared loader for executing Octane compiler output in tests.
 *
 * Real client fixtures should normally be imported through Vitest. Tests that
 * require source bytes which cannot live in a formatted fixture may use the
 * source loader below. This module owns the generated import/export rewriting
 * and the one unavoidable `new Function` boundary.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import * as HydrationRuntime from 'octane/hydration';
import * as ClientRuntime from '../src/index.js';

export type CompiledFixtureModule = Record<string, any>;

export interface ServerFixtureOptions {
	/** Compiler module id. Defaults to the root-relative fixture path. */
	id?: string;
	/** Additional public compiler options; `mode: 'server'` is always enforced. */
	compileOptions?: Record<string, unknown>;
}

export interface CompiledFixtureSourceOptions {
	/** Compiler module id used for diagnostics and source locations. */
	id: string;
	mode: 'client' | 'server';
	/** Additional public compiler options; `mode` is always enforced. */
	compileOptions?: Record<string, unknown>;
}

export function loadCompiledFixtureSource<T extends CompiledFixtureModule = CompiledFixtureModule>(
	source: string,
	options: CompiledFixtureSourceOptions,
): T {
	const { id, mode } = options;
	let { code } = compile(source, id, {
		...options.compileOptions,
		mode,
	});

	const runtime = mode === 'server' ? ServerRuntime : ClientRuntime;
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_match: string, names: string) => `const {${names.replace(/\s+as\s+/g, ': ')}} = __runtime;`,
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/hydration['"];?/g,
		(_match: string, names: string) =>
			`const {${names.replace(/\s+as\s+/g, ': ')}} = __hydrationRuntime;`,
	);

	code = code.replace(
		/export\s+(async\s+)?function\s+(\w+)/g,
		(_match: string, asyncKeyword: string | undefined, name: string) =>
			`__exports.${name} = ${asyncKeyword ?? ''}function ${name}`,
	);
	code = code.replace(
		/export\s+(const|let|var)\s+(\w+)\s*=/g,
		(_match: string, kind: string, name: string) => `${kind} ${name} = __exports.${name} =`,
	);
	code = code.replace(/export\s+default\s+/g, '__exports.default = ');

	if (/^\s*import\s/m.test(code) || /^\s*export\s/m.test(code)) {
		throw new Error(
			`Compiled fixture ${id} contains an import/export shape the shared loader cannot evaluate.`,
		);
	}

	const evaluate = new Function(
		'__runtime',
		'__hydrationRuntime',
		'__exports',
		`'use strict';\n${code}\n//# sourceURL=${id}?${mode}-fixture\nreturn __exports;`,
	);
	return evaluate(runtime, HydrationRuntime, {}) as T;
}

export function loadServerFixture<T extends CompiledFixtureModule = CompiledFixtureModule>(
	fixture: string,
	options: ServerFixtureOptions = {},
): T {
	const absolute = isAbsolute(fixture) ? fixture : resolve(process.cwd(), fixture);
	const defaultId = '/' + relative(process.cwd(), absolute).split(sep).join('/');
	return loadCompiledFixtureSource<T>(readFileSync(absolute, 'utf8'), {
		id: options.id ?? defaultId,
		mode: 'server',
		compileOptions: options.compileOptions,
	});
}
