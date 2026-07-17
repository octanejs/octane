/**
 * Shared loader for executing a real fixture through Octane's server compiler.
 *
 * Client fixtures should be imported normally through Vitest. This helper owns
 * the one unavoidable server-module evaluation boundary so SSR, streaming, and
 * hydration tests do not duplicate generated-import/export rewriting.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';

export type ServerFixtureModule = Record<string, any>;

export interface ServerFixtureOptions {
	/** Compiler module id. Defaults to the root-relative fixture path. */
	id?: string;
	/** Additional public compiler options; `mode: 'server'` is always enforced. */
	compileOptions?: Record<string, unknown>;
}

export function loadServerFixture<T extends ServerFixtureModule = ServerFixtureModule>(
	fixture: string,
	options: ServerFixtureOptions = {},
): T {
	const absolute = isAbsolute(fixture) ? fixture : resolve(process.cwd(), fixture);
	const defaultId = '/' + relative(process.cwd(), absolute).split(sep).join('/');
	let { code } = compile(readFileSync(absolute, 'utf8'), options.id ?? defaultId, {
		...options.compileOptions,
		mode: 'server',
	});

	// Server compilation retargets Octane API imports to `octane/server`.
	// Bind that generated import to the real public runtime supplied below.
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_match: string, names: string) =>
			`const {${names.replace(/\s+as\s+/g, ': ')}} = __serverRuntime;`,
	);

	// Fixtures are authored as normal ESM. Publish named declarations onto a
	// result object while keeping the compiler output otherwise executable.
	code = code.replace(
		/export\s+(async\s+)?function\s+(\w+)/g,
		(_match: string, asyncKeyword: string | undefined, name: string) =>
			`__exports.${name} = ${name}; ${asyncKeyword ?? ''}function ${name}`,
	);
	code = code.replace(
		/export\s+(const|let|var)\s+(\w+)\s*=/g,
		(_match: string, kind: string, name: string) => `${kind} ${name} = __exports.${name} =`,
	);
	code = code.replace(/export\s+default\s+/g, '__exports.default = ');

	if (/^\s*import\s/m.test(code) || /^\s*export\s/m.test(code)) {
		throw new Error(
			`Server fixture ${fixture} contains an import/export shape the shared loader cannot evaluate.`,
		);
	}

	const evaluate = new Function(
		'__serverRuntime',
		'__exports',
		`'use strict';\n` +
			code +
			`\n//# sourceURL=${options.id ?? defaultId}?server-fixture\nreturn __exports;`,
	);
	return evaluate(ServerRuntime, {}) as T;
}
