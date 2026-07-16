import { mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import rspack from '@rspack/core';
import { getOctaneRspackBuildInfo, OctaneRspackPlugin } from '@octanejs/rspack-plugin';
import { pluginOctane } from '@octanejs/rsbuild-plugin';
import { threeRenderers } from '@octanejs/three/config';
import { octane } from '@octanejs/vite-plugin';
import { build as viteBuild } from 'vite';

const fixtureRoot = fileURLToPath(new URL('../_fixtures/bundler-app', import.meta.url));
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const repositoryRoot = resolve(packageRoot, '../..');
const viteOutput = resolve(fixtureRoot, 'dist-vite');
const rsbuildOutput = resolve(fixtureRoot, 'dist-rsbuild');
const rspackOutput = resolve(fixtureRoot, 'dist-rspack');

function linkPackage(name, target) {
	const destination = resolve(fixtureRoot, 'node_modules', ...name.split('/'));
	mkdirSync(dirname(destination), { recursive: true });
	rmSync(destination, { recursive: true, force: true });
	symlinkSync(target, destination, 'dir');
}

async function compileRspack(config) {
	const compiler = rspack(config);
	return new Promise((resolveCompilation, reject) => {
		compiler.run((error, stats) => {
			compiler.close((closeError) => {
				if (error || closeError) {
					reject(error ?? closeError);
					return;
				}
				if (stats == null) {
					reject(new Error('Raw Rspack completed without stats.'));
					return;
				}
				if (stats.hasErrors()) {
					const diagnostics = stats.toJson({ all: false, errors: true }).errors ?? [];
					reject(new Error(diagnostics.map((entry) => entry.message ?? String(entry)).join('\n')));
					return;
				}
				resolveCompilation(stats);
			});
		});
	});
}

for (const output of [viteOutput, rsbuildOutput, rspackOutput]) {
	rmSync(output, { recursive: true, force: true });
}
linkPackage('@octanejs/three', packageRoot);
linkPackage('octane', resolve(repositoryRoot, 'packages/octane'));

await viteBuild({
	root: fixtureRoot,
	configFile: false,
	logLevel: 'silent',
	plugins: [octane({ hmr: false })],
	build: { outDir: viteOutput, emptyOutDir: true, minify: false },
});

const rsbuild = await createRsbuild({
	cwd: fixtureRoot,
	rsbuildConfig: {
		plugins: [pluginOctane({ hmr: false })],
		source: { entry: { index: './src/main.ts' } },
		output: { distPath: { root: 'dist-rsbuild' }, minify: false },
	},
});
await rsbuild.build();

const rspackStats = await compileRspack({
	context: fixtureRoot,
	mode: 'development',
	target: 'web',
	entry: './src/main.ts',
	optimization: { minimize: false },
	output: { path: rspackOutput, filename: 'bundle.js', clean: true },
	resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
	plugins: [
		new rspack.HotModuleReplacementPlugin(),
		new OctaneRspackPlugin({ renderers: threeRenderers }),
	],
});
const sceneModule = [...rspackStats.compilation.modules].find((module) =>
	String(module.resource ?? module.nameForCondition?.() ?? '').endsWith('/src/Scene.three.tsrx'),
);
const source = String(sceneModule?.originalSource?.()?.source?.() ?? '');
const buildInfo = getOctaneRspackBuildInfo(sceneModule);
const bundle = readFileSync(resolve(rspackOutput, 'bundle.js'), 'utf8');

console.log(
	'__OCTANE_THREE_BUNDLER_EVIDENCE__' +
		JSON.stringify({
			buildInfo,
			hmrSelfAccept: source.includes('import.meta.webpackHot.accept()'),
			rspackBundleHasScene: bundle.includes('bundler-proof-cube'),
		}),
);
