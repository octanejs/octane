// The repository's TypeScript 7 (`typescript-native`, the `native` catalog's 7.1
// nightly) and the project settings every local use of it shares, so octane-tsc
// and the tools on its `typescript/unstable/*` API check `.tsrx` the same way.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as jsonc from 'jsonc-parser';

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
 * The package's root export has no compiler API.
 *
 * @param {`unstable/${string}`} subpath
 */
export function importNativeTypeScript(subpath) {
	return import(`typescript-native/${subpath}`);
}

/** The `.tsrx` content mapper, run with `--runExternalCode` (or the API's `runExternalCode`). */
export const TSRX_CONTENT_MAPPER = {
	package: '@tsrx/content-mapper',
	extensions: ['.tsrx'],
	options: { compiler: 'octane/compiler/volar' }, // auto-detection prefers @tsrx/react, which bindings install for parity tests
};

function declaredOptions(project, seen = new Set()) {
	if (seen.has(project)) return {};
	seen.add(project);
	const config = jsonc.parse(readFileSync(project, 'utf8')) ?? {};
	const bases = [config.extends ?? []].flat().filter((base) => base.startsWith('.'));
	const inherited = bases.map((base) => {
		const resolved = path.resolve(path.dirname(project), base);
		return declaredOptions(resolved.endsWith('.json') ? resolved : `${resolved}.json`, seen);
	});
	return Object.assign({}, ...inherited, config.compilerOptions);
}

// TypeScript 7 changed two defaults that tsrx-tsc (TypeScript 5.9) relied on:
// `types` now defaults to none instead of every @types package, and unresolved
// side-effect imports such as './styles.css' are errors. Projects that never
// chose either keep the 5.9 behavior they were written against.
export function compatibilityOptions(project) {
	const declared = declaredOptions(project);
	return {
		...(declared.types === undefined ? { types: ['*'] } : {}),
		...(declared.noUncheckedSideEffectImports === undefined
			? { noUncheckedSideEffectImports: false }
			: {}),
	};
}
