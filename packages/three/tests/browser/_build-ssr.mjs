import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import rspack from '@rspack/core';
import { getOctaneRspackBuildInfo, OctaneRspackPlugin } from '@octanejs/rspack-plugin';
import { pluginOctane } from '@octanejs/rsbuild-plugin';
import { threeRenderers } from '@octanejs/three/config';
import { build as viteBuild } from 'vite';
import { createStagingRoot, stageFixture } from './_stage-fixture.mjs';

const fixtureRoot = fileURLToPath(new URL('../_fixtures/ssr-app', import.meta.url));
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const repositoryRoot = resolve(packageRoot, '../..');

// The suite passes the staging directory in so it can remove it even when this
// helper throws; run standalone, the helper makes its own. Either way the build
// happens outside the checkout. Only the package under test and `app-core` —
// which the fixture's octane.config.ts imports but `@octanejs/three` does not
// depend on — are missing from the installed graph mirrored beside it.
const appRoot = stageFixture(fixtureRoot, process.argv[2] ?? createStagingRoot('three-ssr'), {
	dependencies: packageRoot,
	link: {
		'@octanejs/app-core': resolve(repositoryRoot, 'packages/app-core'),
		'@octanejs/three': packageRoot,
	},
});

const outputs = {
	vite: resolve(appRoot, 'dist-vite'),
	rsbuild: resolve(appRoot, 'dist-rsbuild'),
	rspackClient: resolve(appRoot, 'dist-rspack-client'),
	rspackServer: resolve(appRoot, 'dist-rspack-server'),
};

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

function moduleEvidence(stats, file) {
	const suffix = `${sep}src${sep}${file}`;
	const module = [...stats.compilation.modules].find((candidate) =>
		String(candidate.resource ?? candidate.nameForCondition?.() ?? '').endsWith(suffix),
	);
	return {
		buildInfo: getOctaneRspackBuildInfo(module),
		present: module !== undefined,
	};
}

const previousOutDir = process.env.OCTANE_THREE_SSR_OUTDIR;
try {
	process.env.OCTANE_THREE_SSR_OUTDIR = 'dist-vite';
	await viteBuild({
		root: appRoot,
		configFile: resolve(appRoot, 'vite.config.ts'),
		logLevel: 'silent',
	});

	process.env.OCTANE_THREE_SSR_OUTDIR = 'dist-rsbuild';
	const rsbuild = await createRsbuild({
		cwd: appRoot,
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
		context: appRoot,
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
const rawClientScene = moduleEvidence(rawClient, 'Scene.three.tsrx');
const rawServerScene = moduleEvidence(rawServer, 'Scene.three.tsrx');
const rawClientSetup = moduleEvidence(rawClient, 'scene-setup.ts');
const rawServerSetup = moduleEvidence(rawServer, 'scene-setup.ts');

console.log(
	'__OCTANE_THREE_SSR_EVIDENCE__' +
		JSON.stringify({
			appRoot,
			raw: {
				clientScene: rawClientScene,
				clientSetupPresent: rawClientSetup.present,
				serverScene: rawServerScene,
				serverSetupPresent: rawServerSetup.present,
			},
		}),
);
