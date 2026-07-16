import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import rspack from '@rspack/core';
import { getOctaneRspackBuildInfo, OctaneRspackPlugin } from '@octanejs/rspack-plugin';
import { pluginOctane } from '@octanejs/rsbuild-plugin';
import { threeRenderers } from '@octanejs/three/config';
import { build as viteBuild } from 'vite';

const fixtureRoot = fileURLToPath(new URL('../_fixtures/ssr-app', import.meta.url));
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const repositoryRoot = resolve(packageRoot, '../..');
const outputs = {
	vite: resolve(fixtureRoot, 'dist-vite'),
	rsbuild: resolve(fixtureRoot, 'dist-rsbuild'),
	rspackClient: resolve(fixtureRoot, 'dist-rspack-client'),
	rspackServer: resolve(fixtureRoot, 'dist-rspack-server'),
};

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

function moduleEvidence(stats, suffix) {
	const module = [...stats.compilation.modules].find((candidate) =>
		String(candidate.resource ?? candidate.nameForCondition?.() ?? '').endsWith(suffix),
	);
	return {
		buildInfo: getOctaneRspackBuildInfo(module),
		present: module !== undefined,
	};
}

for (const output of Object.values(outputs)) {
	rmSync(output, { recursive: true, force: true });
}

linkPackage('@octanejs/app-core', resolve(repositoryRoot, 'packages/app-core'));
linkPackage('@octanejs/rsbuild-plugin', resolve(repositoryRoot, 'packages/rsbuild-plugin-octane'));
linkPackage('@octanejs/rspack-plugin', resolve(repositoryRoot, 'packages/rspack-plugin-octane'));
linkPackage('@octanejs/three', packageRoot);
linkPackage('@octanejs/vite-plugin', resolve(repositoryRoot, 'packages/vite-plugin-octane'));
linkPackage('@rsbuild/core', resolve(packageRoot, 'node_modules/@rsbuild/core'));
linkPackage('@rspack/core', resolve(packageRoot, 'node_modules/@rspack/core'));
linkPackage('octane', resolve(repositoryRoot, 'packages/octane'));
linkPackage('three', resolve(packageRoot, 'node_modules/three'));
linkPackage('vite', resolve(packageRoot, 'node_modules/vite'));

const previousOutDir = process.env.OCTANE_THREE_SSR_OUTDIR;
try {
	process.env.OCTANE_THREE_SSR_OUTDIR = 'dist-vite';
	await viteBuild({
		root: fixtureRoot,
		configFile: resolve(fixtureRoot, 'vite.config.ts'),
		logLevel: 'silent',
	});

	process.env.OCTANE_THREE_SSR_OUTDIR = 'dist-rsbuild';
	const rsbuild = await createRsbuild({
		cwd: fixtureRoot,
		rsbuildConfig: {
			plugins: [pluginOctane({ hmr: false })],
		},
	});
	await rsbuild.build();
} finally {
	if (previousOutDir === undefined) delete process.env.OCTANE_THREE_SSR_OUTDIR;
	else process.env.OCTANE_THREE_SSR_OUTDIR = previousOutDir;
}

async function buildRawRspack(environment) {
	const output = environment === 'client' ? outputs.rspackClient : outputs.rspackServer;
	return compileRspack({
		context: fixtureRoot,
		mode: 'development',
		target: environment === 'client' ? 'web' : 'node',
		entry: './src/raw-entry.js',
		optimization: { minimize: false },
		output: { path: output, filename: 'bundle.js', clean: true },
		resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
		plugins: [new OctaneRspackPlugin({ renderers: threeRenderers })],
	});
}

const rawClient = await buildRawRspack('client');
const rawServer = await buildRawRspack('server');
const rawClientScene = moduleEvidence(rawClient, '/src/Scene.three.tsrx');
const rawServerScene = moduleEvidence(rawServer, '/src/Scene.three.tsrx');
const rawClientSetup = moduleEvidence(rawClient, '/src/scene-setup.ts');
const rawServerSetup = moduleEvidence(rawServer, '/src/scene-setup.ts');

console.log(
	'__OCTANE_THREE_SSR_EVIDENCE__' +
		JSON.stringify({
			raw: {
				clientScene: rawClientScene,
				clientSetupPresent: rawClientSetup.present,
				serverScene: rawServerScene,
				serverSetupPresent: rawServerSetup.present,
			},
		}),
);
