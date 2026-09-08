import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { createOctaneCompiler } from '../../packages/octane/src/compiler/bundler.js';

/** Compile an authored fixture and its binding imports against the server runtime. */
export function octaneServerFixtures(root) {
	const prefix = '\0octane-server-fixture:';
	return {
		name: 'octane-server-fixtures',
		enforce: 'pre',
		resolveId(id, importer) {
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
				resolveExtensions: ['.tsrx', '.tsx', '.ts', '.jsx', '.js', '.json'],
				plugins: [
					{
						name: 'octane-server-compile',
						setup(builder) {
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
