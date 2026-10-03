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
import { dirname, join, posix, relative, sep } from 'node:path';
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

// Package-internal `#octane/<name>` imports name ./src, so a module published
// in place (and every harness that loads dist/ from the repository) would mix in
// source. Each such key has a `#octane/dist/<name>` twin that both manifests map
// to the bundler tree, which dist/ imports instead: a bundler can still select its
// conditions, such as `octane-islands` (src/signals/action-capability.ts). Node's
// trees never see a bundler condition, so they import the default target directly.
function publishedPackageImports(packageDir) {
	const imports = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).imports ?? {};
	const rewrites = [];
	for (const [specifier, targets] of Object.entries(imports)) {
		if (!specifier.startsWith('#octane/dist/')) continue;
		if (typeof targets?.default !== 'string' || !targets.default.startsWith('./dist/'))
			throw new Error(`${specifier} needs a default ./dist/ target`);
		rewrites.push({
			specifier: `#octane/${specifier.slice('#octane/dist/'.length)}`,
			bundler: specifier,
			node: targets.default.slice('./dist/'.length),
		});
	}
	return rewrites;
}

function rewritePackageImports(source, filename, rewrites, nodeTree) {
	for (const { specifier, bundler, node } of rewrites) {
		let target = bundler;
		if (nodeTree) {
			target = posix.relative(posix.dirname(filename), node);
			if (!target.startsWith('.')) target = `./${target}`;
		}
		for (const quote of ["'", '"'])
			source = source.replaceAll(quote + specifier + quote, quote + target + quote);
	}
	return source;
}

// esbuild uses only the first onLoad result per file, so both source passes share
// one plugin: zero-argument errors are specialized first
// (specialize-error-calls.mjs), which may add environment guards of its own.
function publishedSource(src, catalog, { compileEnvironment }) {
	const rewrites = publishedPackageImports(dirname(src));
	return {
		name: 'octane-published-source',
		setup(bundler) {
			bundler.onLoad({ filter: /\.[jt]s$/ }, async ({ path }) => {
				const filename = relative(src, path).split(sep).join('/');
				if (filename.startsWith('../')) return;
				const source = await readFile(path, 'utf8');
				let contents = specializeErrorCalls(source, filename, catalog);
				contents = rewritePackageImports(contents, filename, rewrites, compileEnvironment);
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
