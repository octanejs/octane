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
import ts from 'typescript';
import { compile } from 'octane/compiler';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import * as ServerRuntime from 'octane/server';
import * as HydrationRuntime from 'octane/hydration';
import * as InternalClientRuntime from 'octane/internal/client';
import * as InternalServerRuntime from 'octane/internal/server';
import * as ClientRuntime from '../src/index.js';

export type CompiledFixtureModule = Record<string, any>;

export interface ServerFixtureOptions {
	/** Compiler module id. Defaults to the root-relative fixture path. */
	id?: string;
	/** Additional public compiler options; `mode: 'server'` is always enforced. */
	compileOptions?: Record<string, unknown>;
	/** Real optional runtime entrypoints used by the authored fixture. */
	runtimeModules?: Readonly<Record<string, CompiledFixtureModule>>;
}

export interface CompiledFixtureSourceOptions {
	/** Compiler module id used for diagnostics and source locations. */
	id: string;
	mode: 'client' | 'server';
	/** Additional public compiler options; `mode` is always enforced. */
	compileOptions?: Record<string, unknown>;
	/** Self-contained external modules used by custom-renderer fixtures. */
	runtimeModules?: Readonly<Record<string, CompiledFixtureModule>>;
}

export interface PlainHookFixtureSourceOptions {
	id: string;
	inlineHookMemo: boolean;
	manualSlots?: boolean;
	nativeReads?: boolean;
}

export function loadCompiledFixtureSource<T extends CompiledFixtureModule = CompiledFixtureModule>(
	source: string,
	options: CompiledFixtureSourceOptions,
): T {
	const { id, mode } = options;
	const { code } = compile(source, id, {
		...options.compileOptions,
		mode,
	});
	return evaluateCompiledFixtureCode<T>(code, id, mode, options.runtimeModules);
}

/** Execute the public plain-module transform through the shared module loader. */
export function loadPlainHookFixtureSource<T extends CompiledFixtureModule = CompiledFixtureModule>(
	source: string,
	options: PlainHookFixtureSourceOptions,
): T {
	const out = slotHooks(source, options.id, {
		environment: 'client',
		hmr: false,
		dev: false,
		profile: false,
		inlineHookMemo: options.inlineHookMemo,
		manualSlots: options.manualSlots,
		nativeReads: options.nativeReads,
	});
	// The plain path deliberately leaves TypeScript to its host toolchain.
	// Strip it here exactly once, then use the same evaluation boundary as the
	// component compiler fixtures. No generated module is recompiled by Octane.
	const { outputText } = ts.transpileModule(out?.code ?? source, {
		fileName: options.id,
		compilerOptions: {
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			verbatimModuleSyntax: true,
		},
	});
	return evaluateCompiledFixtureCode<T>(outputText, options.id, 'client', undefined);
}

function evaluateCompiledFixtureCode<T extends CompiledFixtureModule>(
	code: string,
	id: string,
	mode: 'client' | 'server',
	runtimeModules: Readonly<Record<string, CompiledFixtureModule>> | undefined,
): T {
	const runtime = mode === 'server' ? ServerRuntime : ClientRuntime;
	const internalRuntime = mode === 'server' ? InternalServerRuntime : InternalClientRuntime;
	code = code.replace(
		/import\s*\*\s*as\s+([\w$]+)\s*from\s*['"]octane\/internal\/(?:client|server)['"];?/g,
		(_match: string, name: string) => `const ${name} = __internalRuntime;`,
	);
	code = code.replace(
		/import\s*\*\s*as\s+([\w$]+)\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_match: string, name: string) => `const ${name} = __runtime;`,
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/internal\/(?:client|server)['"];?/g,
		(_match: string, names: string) =>
			`const {${names.replace(/\s+as\s+/g, ': ')}} = __internalRuntime;`,
	);
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
		/import\s+(\*\s+as\s+[\w$]+|\{[^}]*\}|[\w$]+)\s+from\s*['"]([^'"]+)['"];?/g,
		(match: string, binding: string, request: string) => {
			if (runtimeModules === undefined || !Object.hasOwn(runtimeModules, request)) return match;
			const module = `__runtimeModules[${JSON.stringify(request)}]`;
			if (binding.startsWith('*'))
				return `const ${binding.replace(/^\*\s+as\s+/, '')} = ${module};`;
			if (binding.startsWith('{'))
				return `const ${binding.replace(/\s+as\s+/g, ': ')} = ${module};`;
			return `const ${binding} = ${module}.default;`;
		},
	);

	// `export function X` must stay a real function *declaration*: compiled
	// modules reference exported components by name after the declaration (the
	// compiler's module tail stamps `X.$$singleRoot = true;`, and sibling
	// components call each other directly). Strip only the `export ` keyword
	// here and register the exports at the end of the module — declarations
	// hoist, so end-of-module registration is safe and also observes any later
	// reassignment of the binding.
	const functionExports: string[] = [];
	code = code.replace(
		/export\s+(async\s+)?function\s+([\w$]+)/g,
		(_match: string, asyncKeyword: string | undefined, name: string) => {
			functionExports.push(name);
			return `${asyncKeyword ?? ''}function ${name}`;
		},
	);
	code = code.replace(
		/export\s+(const|let|var)\s+([\w$]+)\s*=/g,
		(_match: string, kind: string, name: string) => `${kind} ${name} = __exports.${name} =`,
	);
	code = code.replace(/export\s+default\s+/g, '__exports.default = ');

	if (/^\s*import\s/m.test(code) || /^\s*export\s/m.test(code)) {
		throw new Error(
			`Compiled fixture ${id} contains an import/export shape the shared loader cannot evaluate.`,
		);
	}

	for (const name of functionExports) {
		code += `\n__exports.${name} = ${name};`;
	}

	const evaluate = new Function(
		'__runtime',
		'__internalRuntime',
		'__hydrationRuntime',
		'__runtimeModules',
		'__exports',
		`'use strict';\n${code}\n//# sourceURL=${id}?${mode}-fixture\nreturn __exports;`,
	);
	return evaluate(runtime, internalRuntime, HydrationRuntime, runtimeModules, {}) as T;
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
		runtimeModules: options.runtimeModules,
	});
}
