import { readFile } from 'node:fs/promises';

/** Compile installed authored source inside a consumer build, never inside a published package. */
export async function createOctaneSourcePlugin(
	root,
	compilerModule = new URL('../packages/octane/src/compiler/bundler.js', import.meta.url).href,
) {
	const { createOctaneCompiler } = await import(compilerModule);
	const compiler = createOctaneCompiler({ root });
	const compiled = new Map();
	return {
		name: 'octane-authored-source',
		setup(buildApi) {
			buildApi.onLoad({ filter: /\.(?:[cm]?[jt]s|tsrx)$/ }, async ({ path }) => {
				let contents = compiled.get(path);
				if (contents === undefined) {
					const source = await readFile(path, 'utf8');
					contents =
						compiler.transform(source, path, {
							environment: 'client',
							dev: false,
							hmr: false,
							profile: false,
						})?.code ?? source;
					compiled.set(path, contents);
				}
				return { contents, loader: 'ts' };
			});
		},
	};
}
