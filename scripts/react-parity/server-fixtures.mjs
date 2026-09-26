import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { createOctaneCompiler } from '../../packages/octane/src/compiler/bundler.js';

const resolveExtensions = ['.tsrx', '.tsx', '.ts', '.jsx', '.js', '.json'];

/** Compile an authored fixture and its binding imports against the server runtime. */
export function octaneServerFixtures(root) {
	const prefix = '\0octane-server-fixture:';
	return {
		name: 'octane-server-fixtures',
		enforce: 'pre',
		resolveId(id, importer) {
			if (importer?.startsWith(prefix) && /^octane(?:\/|$)/.test(id)) {
				return this.resolve(id, importer.slice(prefix.length, -'.js'.length), { skipSelf: true });
			}
			if (!id.endsWith('?octane-ssr')) return;
			if (!importer || !id.startsWith('.'))
				throw new Error('Server fixtures require a relative authored module.');
			return prefix + resolve(dirname(importer), id.slice(0, -'?octane-ssr'.length)) + '.js';
		},
		async load(id) {
			if (!id.startsWith(prefix)) return;
			const compiler = createOctaneCompiler({ root });
			const result = await build({
				entryPoints: [id.slice(prefix.length, -'.js'.length)],
				bundle: true,
				write: false,
				format: 'esm',
				platform: 'node',
				target: 'esnext',
				external: ['octane', 'octane/*'],
				resolveExtensions,
				// Stylesheet imports have no server output; the client build owns them.
				loader: { '.css': 'empty' },
				plugins: [
					{
						name: 'octane-server-compile',
						setup(builder) {
							// esbuild matches directory entries case-insensitively, so `./link`
							// would resolve to `Link.tsrx` before `link.ts`. Prefer exact names.
							builder.onResolve({ filter: /^\.\.?\// }, async ({ path, resolveDir }) => {
								const target = resolve(resolveDir, path);
								const name = basename(target);
								const entries = await readdir(dirname(target)).catch(() => null);
								if (entries === null || entries.includes(name)) return;
								const extension = resolveExtensions.find((ext) => entries.includes(name + ext));
								if (extension !== undefined) return { path: target + extension };
							});
							builder.onLoad({ filter: /\.(?:tsrx|tsx|ts|jsx|js)$/ }, async ({ path }) => {
								const source = await readFile(path, 'utf8');
								const transformed = compiler.transform(source, path, {
									environment: 'server',
									explicitRuntimeRequests: true,
									dev: true,
									hmr: false,
									profile: false,
								});
								return {
									contents: transformed?.code ?? source,
									loader: path.endsWith('.js') ? 'js' : 'ts',
									resolveDir: dirname(path),
								};
							});
						},
					},
				],
			});
			return result.outputFiles[0].text;
		},
	};
}
