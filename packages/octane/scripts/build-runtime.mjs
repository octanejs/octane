// Builds the published runtime from `src/` (everything but the plain-JS compiler,
// which build.mjs copies). The harnesses that reproduce a published install call
// this too, so they cannot drift from the real build.
//
// Three trees are emitted, each transpiled per file:
//   dist/       ESM for bundlers. Every guard keeps its literal
//               process.env.NODE_ENV comparison, which the consumer's bundler
//               substitutes and folds. esbuild never inlines a top-level const
//               in a module with imports, so a hoisted flag here would keep
//               every development branch in its production bundles.
//   dist/node/  ESM behind the `node` export condition, and
//   dist/cjs/   CommonJS for require(). Node evaluates these unbundled, so each
//               module reads the environment once instead (compile-node-env.mjs).
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../../../scripts/error-codes/generate.mjs';
import { buildPackageCommonjs } from '../../../scripts/build-package-commonjs.mjs';
import { compileNodeEnvReads } from './compile-node-env.mjs';
import { specializeErrorCalls } from './specialize-error-calls.mjs';

export const COMMONJS_ENTRIES = [
	'src/index.ts',
	'src/server/index.ts',
	'src/internal/client.ts',
	'src/internal/server.ts',
	'src/internal/context.ts',
	'src/signals/index.ts',
	'src/signals/client.ts',
	'src/signals/server.ts',
];

const catalogPath = fileURLToPath(new URL('../error-codes/codes.json', import.meta.url));

// esbuild uses only the first onLoad result per file, so both source passes share
// one plugin: zero-argument errors are specialized first
// (specialize-error-calls.mjs), which may add environment guards of its own.
function publishedSource(src, catalog, { compileEnvironment }) {
	return {
		name: 'octane-published-source',
		setup(bundler) {
			bundler.onLoad({ filter: /\.[jt]s$/ }, async ({ path }) => {
				const filename = relative(src, path).split(sep).join('/');
				if (filename.startsWith('../')) return;
				const source = await readFile(path, 'utf8');
				let contents = specializeErrorCalls(source, filename, catalog);
				if (compileEnvironment) contents = compileNodeEnvReads(contents, filename);
				if (contents !== source) {
					return {
						contents,
						loader: path.endsWith('.js') ? 'js' : 'ts',
						resolveDir: dirname(path),
						watchFiles: [path, catalogPath],
					};
				}
			});
		},
	};
}

export async function buildPublishedRuntime(packageDir) {
	const src = join(packageDir, 'src');
	const dist = join(packageDir, 'dist');
	const catalog = validateCatalog(JSON.parse(readFileSync(catalogPath, 'utf8')));
	const entryPoints = readdirSync(src, { recursive: true })
		.filter(
			(file) =>
				(file.endsWith('.ts') || file.endsWith('.js')) &&
				!file.endsWith('.d.ts') &&
				!file.startsWith(`compiler${sep}`),
		)
		.map((file) => join(src, file));
	for (const [outdir, compileEnvironment] of [
		[dist, false],
		[join(dist, 'node'), true],
	]) {
		await build({
			entryPoints,
			outdir,
			outbase: src,
			format: 'esm',
			platform: 'neutral',
			target: 'esnext',
			bundle: false,
			plugins: [publishedSource(src, catalog, { compileEnvironment })],
		});
	}
	return buildPackageCommonjs({
		packageDir,
		entries: COMMONJS_ENTRIES,
		outdir: 'dist/cjs',
		sourceRoot: 'src',
		plugins: [publishedSource(src, catalog, { compileEnvironment: true })],
	});
}
