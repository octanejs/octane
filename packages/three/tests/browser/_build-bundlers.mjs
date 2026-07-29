import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import rspack from '@rspack/core';
import { getOctaneRspackBuildInfo, OctaneRspackPlugin } from '@octanejs/rspack-plugin';
import { pluginOctane } from '@octanejs/rsbuild-plugin';
import { threeRenderers } from '@octanejs/three/config';
import { octane } from '@octanejs/vite-plugin';
import { build as viteBuild } from 'vite';
import { createStagingRoot, stageFixture } from './_stage-fixture.mjs';

const fixtureRoot = fileURLToPath(new URL('../_fixtures/bundler-app', import.meta.url));
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

// The suite passes the staging directory in so it can remove it even when this
// helper throws; run standalone, the helper makes its own. Either way the build
// happens outside the checkout. `@octanejs/three` is the package under test, so
// it is the one dependency missing from its own installed graph.
const appRoot = stageFixture(fixtureRoot, process.argv[2] ?? createStagingRoot('three-bundler'), {
	dependencies: packageRoot,
	link: { '@octanejs/three': packageRoot },
});

const viteOutput = resolve(appRoot, 'dist-vite');
const rsbuildOutput = resolve(appRoot, 'dist-rsbuild');
const rspackOutput = resolve(appRoot, 'dist-rspack');

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

const viteResult = await viteBuild({
	root: appRoot,
	configFile: false,
	logLevel: 'silent',
	plugins: [octane({ hmr: false })],
	build: { outDir: viteOutput, emptyOutDir: true, minify: false },
});
const viteResults = Array.isArray(viteResult) ? viteResult : [viteResult];
const viteRenderedThreeModules = [
	...new Set(
		viteResults.flatMap((result) =>
			result.output.flatMap((output) => {
				if (output.type !== 'chunk') return [];
				return Object.entries(output.modules)
					.filter(([, module]) => module.renderedLength > 0)
					.map(([moduleId]) => moduleId.split('?')[0])
					.filter((moduleId) => moduleId.startsWith(resolve(packageRoot, 'src')))
					.map((moduleId) => relative(packageRoot, moduleId).replaceAll('\\', '/'));
			}),
		),
	),
].sort();

const rsbuild = await createRsbuild({
	cwd: appRoot,
	rsbuildConfig: {
		plugins: [pluginOctane({ hmr: false })],
		source: { entry: { index: './src/main.ts' } },
		output: { distPath: { root: 'dist-rsbuild' }, minify: false },
	},
});
await rsbuild.build();

const rspackStats = await compileRspack({
	context: appRoot,
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
	String(module.resource ?? module.nameForCondition?.() ?? '').endsWith(
		`${sep}src${sep}Scene.three.tsrx`,
	),
);
const source = String(sceneModule?.originalSource?.()?.source?.() ?? '');
const buildInfo = getOctaneRspackBuildInfo(sceneModule);
const bundle = readFileSync(resolve(rspackOutput, 'bundle.js'), 'utf8');

console.log(
	'__OCTANE_THREE_BUNDLER_EVIDENCE__' +
		JSON.stringify({
			appRoot,
			buildInfo,
			hmrSelfAccept: source.includes('import.meta.webpackHot.accept()'),
			rspackBundleHasScene: bundle.includes('bundler-proof-cube'),
			viteRenderedThreeModules,
		}),
);
