// The repository's TypeScript 7 (`typescript-native`, the `native` catalog's 7.1
// nightly) and the project settings every local use of it shares, so octane-tsc
// and the tools on its `typescript/unstable/*` API check `.tsrx` the same way.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const nativePackage = createRequire(import.meta.url).resolve('typescript-native/package.json');

export const NATIVE_TSC = path.join(path.dirname(nativePackage), 'bin/tsc');

/**
 * Where the native compiler's own `lib.*.d.ts` files live: its platform package,
 * not the `typescript-native` package. Declarations there are TypeScript's.
 */
export const NATIVE_LIBRARY_DIRECTORY = path.join(
	path.dirname(
		createRequire(nativePackage).resolve(
			`@typescript/typescript-${process.platform}-${process.arch}/package.json`,
		),
	),
	'lib',
);

/**
 * Import a module of the native TypeScript's API, such as `unstable/sync` or
 * `unstable/ast`, for a caller that cannot resolve `typescript-native` itself.
 * The package's root export has no compiler API. The module is imported by its
 * resolved path, not by name, because a bundled caller (Vite bundles
 * vitest.config.js and the scripts it imports) resolves bare dynamic imports
 * from the bundle's directory.
 *
 * @param {`unstable/${string}`} subpath
 */
export function importNativeTypeScript(subpath) {
	// The package resolves its own name (`typescript`) through its exports.
	return import(pathToFileURL(createRequire(nativePackage).resolve(`typescript/${subpath}`)).href);
}

/**
 * Emit declarations for `files` with the native compiler, through a tsconfig
 * written to `directory`. `compilerOptions` use tsconfig spelling. As with the
 * classic `program.emit()`, diagnostics do not fail the emit (exit status 2:
 * outputs generated); only skipped outputs throw, with the compiler's output.
 *
 * @param {string} directory
 * @param {readonly string[]} files
 * @param {Record<string, unknown>} compilerOptions
 */
export function emitNativeDeclarations(directory, files, compilerOptions) {
	const tsconfig = path.join(directory, 'tsconfig.json');
	writeFileSync(
		tsconfig,
		JSON.stringify({
			compilerOptions: { ...compilerOptions, declaration: true, emitDeclarationOnly: true },
			files,
		}),
	);
	try {
		execFileSync(process.execPath, [NATIVE_TSC, '-p', tsconfig, '--pretty', 'false'], {
			encoding: 'utf8',
			stdio: 'pipe',
		});
	} catch (error) {
		const failure = /** @type {{ status?: number, stdout?: string, stderr?: string }} */ (error);
		if (failure.status === 2) return;
		throw new Error(
			`Native TypeScript skipped declaration emit:\n${failure.stdout ?? ''}${failure.stderr ?? String(error)}`,
			{ cause: error },
		);
	}
}

/** The `.tsrx` content mapper, run with `--runExternalCode` (or the API's `runExternalCode`). */
export const TSRX_CONTENT_MAPPER = {
	package: '@tsrx/content-mapper',
	extensions: ['.tsrx'],
	options: { compiler: 'octane/compiler/volar' }, // auto-detection prefers @tsrx/react, which bindings install for parity tests
};
