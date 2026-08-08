// Production public-import reachability: build and execute each independent
// feature entry before publishing deterministic byte totals and budget peers.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import { build as buildEsbuild } from 'esbuild';
import { createOctaneCompiler } from 'octane/compiler/bundler';
import { octane } from 'octane/compiler/vite';
import { build as buildVite } from 'vite';
import { verifyScenario } from './verify-reachability.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');
const fixtures = path.join(directory, 'fixtures/minimal');
const budgetFile = path.join(directory, 'minimal-budgets.json');
const budgets = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
const existingScenarios = [
	['capture-only', 'ts'],
	['root-static-specialized', 'ts'],
	['root-static', 'tsrx'],
	['hooks-state', 'tsrx'],
	['context', 'tsrx'],
	['hydrate-root', 'tsrx'],
	['deferred-hydration', 'tsrx'],
	['suspense-transition', 'tsrx'],
	['binding-vanilla', 'ts'],
	['binding-hooks', 'tsrx'],
];
const bindingScenarios = [
	{
		id: 'binding-base-ui',
		extension: 'ts',
		package: '@octanejs/base-ui',
		forbidden: /\/packages\/base-ui\/src\/(?:dialog|popover)\.ts$/,
	},
	{
		id: 'binding-aria',
		extension: 'ts',
		package: '@octanejs/aria',
		forbidden:
			/\/packages\/aria\/src\/(?:numberfield\/useNumberField|radio\/useRadio|menu\/useMenu)\.ts$/,
	},
	{
		id: 'binding-motion',
		extension: 'ts',
		package: '@octanejs/motion',
		forbidden: /\/packages\/motion\/src\/(?:context|useSpring)\.ts$/,
	},
	{
		id: 'binding-radix',
		extension: 'ts',
		package: '@octanejs/radix',
		forbidden: /\/packages\/radix\/src\/(?:Dialog|Popover)\.ts$/,
	},
	{
		id: 'binding-floating-ui',
		extension: 'ts',
		package: '@octanejs/floating-ui',
		forbidden: /\/packages\/floating-ui\/src\/(?:context|tree|FloatingPortal)\.ts$/,
	},
	{
		id: 'binding-mantine-hooks',
		extension: 'tsrx',
		package: '@octanejs/mantine-hooks',
		forbidden: /\/packages\/mantine-hooks\/src\/use-(?:local|session)-storage\//,
	},
	{
		id: 'binding-usehooks-ts',
		extension: 'tsrx',
		package: '@octanejs/usehooks-ts',
		forbidden: /\/packages\/usehooks-ts\/src\/timing\.ts$/,
	},
];
const scenarios = [
	...existingScenarios.map(([id, extension]) => ({
		id,
		name: id,
		extension,
		bundler: 'vite',
	})),
	...bindingScenarios.flatMap((scenario) =>
		['vite', 'esbuild'].map((bundler) => ({
			...scenario,
			name: `${scenario.id}-${bundler}`,
			bundler,
		})),
	),
];
const productionDefines = {
	__OCTANE_PROFILE_ENABLED__: 'false',
	'process.env.NODE_ENV': JSON.stringify('production'),
};
const compiler = createOctaneCompiler({ root: directory });
const stat = (value) => ({ median: value, min: value, samples: 1 });
const forbidden = [
	['React', /\/node_modules\/react(?:-dom)?\//],
	['Octane React compatibility', /\/packages\/octane\/src\/react\//],
	['server runtime', /\/packages\/octane\/src\/(?:runtime\.server\.ts|server\/)/],
	['profiling', /\/packages\/octane\/src\/profiling\.ts$/],
	['devtools', /\/packages\/octane\/src\/[^/]*devtools[^/]*\.[jt]s$/],
	['devalue', /\/node_modules\/devalue\//],
	['unused package metadata', /\/packages\/octane\/(?:package\.json|src\/version\.ts)$/],
];

function verifyBindingSideEffectsInventory() {
	const ariaBootstrap = [
		'./src/index.ts',
		'./src/interactions/useFocusVisible.ts',
		'./src/utils/runAfterTransition.ts',
	];
	for (const scenario of bindingScenarios) {
		const packageDirectory = path.join(
			repository,
			'packages',
			scenario.package.slice('@octanejs/'.length),
		);
		const manifest = JSON.parse(
			fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
		);
		assert.equal(
			manifest.name,
			scenario.package,
			`${scenario.id}: incorrect published package inventory`,
		);
		if (scenario.package !== '@octanejs/aria') {
			assert.equal(
				manifest.sideEffects,
				false,
				`${scenario.package}: reviewed modules must remain pure`,
			);
			continue;
		}
		assert.deepEqual(
			manifest.sideEffects,
			ariaBootstrap,
			`${scenario.package}: browser bootstrap changed its reviewed side-effect allowlist`,
		);
		for (const allowed of ariaBootstrap) {
			const filename = path.resolve(packageDirectory, allowed);
			assert.equal(
				filename.startsWith(packageDirectory + path.sep) && fs.statSync(filename).isFile(),
				true,
				`${scenario.package}: declared browser bootstrap source is missing: ${allowed}`,
			);
			assert.equal(
				manifest.files.some(
					(included) => allowed === `./${included}` || allowed.startsWith(`./${included}/`),
				),
				true,
				`${scenario.package}: declared browser bootstrap source is missing from the published package: ${allowed}`,
			);
		}
	}
	for (const packageName of [
		'rainbowkit',
		'nuqs',
		'testing-library',
		'recharts',
		'styled-components',
	]) {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(repository, 'packages', packageName, 'package.json'), 'utf8'),
		);
		assert.notEqual(
			manifest.sideEffects,
			false,
			`${manifest.name}: genuinely effectful modules must not be globally marked pure`,
		);
	}
}

verifyBindingSideEffectsInventory();

const expectedNames = new Set(scenarios.map(({ name }) => name));
assert.deepEqual(
	Object.keys(budgets).sort(),
	[...expectedNames].sort(),
	'minimal-import budgets must cover every scenario exactly once',
);

const payload = { suite: 'bundle-reachability', iterations: 1, targets: [] };

async function buildScenario(scenario, entry) {
	if (scenario.bundler === 'esbuild') {
		const result = await buildEsbuild({
			absWorkingDir: repository,
			entryPoints: [entry],
			bundle: true,
			write: false,
			format: 'iife',
			globalName: '__OCTANE_REACHABILITY__',
			platform: 'browser',
			target: 'esnext',
			minify: true,
			treeShaking: true,
			metafile: true,
			logLevel: 'silent',
			define: productionDefines,
			plugins: [
				{
					name: 'octane-reachability-template',
					setup(build) {
						build.onLoad({ filter: /\.(?:tsrx|ts)$/ }, ({ path: filename }) => {
							const template = filename.endsWith('.tsrx');
							if (!template && !filename.includes('/packages/mantine-hooks/src/')) return null;
							const source = fs.readFileSync(filename, 'utf8');
							const result = compiler.transform(source, filename, {
								environment: 'client',
								hmr: false,
								dev: false,
								profile: false,
							});
							if (template) {
								assert.equal(
									result?.kind,
									'compile',
									`${scenario.name}: uncompiled Octane template`,
								);
							}
							if (result === null || result.kind === 'none') return null;
							return { contents: result.code, loader: result.kind === 'compile' ? 'js' : 'ts' };
						});
					},
				},
			],
		});
		assert.equal(result.outputFiles.length, 1, `${scenario.name}: unexpected executable outputs`);
		const output = Object.values(result.metafile.outputs);
		assert.equal(output.length, 1, `${scenario.name}: unexpected production dependency outputs`);
		const modules = Object.entries(output[0].inputs)
			.filter(([, input]) => input.bytesInOutput > 0)
			.map(([id]) => path.resolve(repository, id));
		return { code: result.outputFiles[0].text, modules, runtimeExports: [] };
	}

	const result = await buildVite({
		configFile: false,
		root: directory,
		mode: 'production',
		logLevel: 'error',
		plugins: [octane({ hmr: false })],
		define: productionDefines,
		build: {
			write: false,
			minify: 'esbuild',
			target: 'esnext',
			lib: {
				entry,
				formats: ['iife'],
				name: '__OCTANE_REACHABILITY__',
			},
		},
	});
	const built = Array.isArray(result) ? result : [result];
	assert.equal(built.length, 1, `${scenario.name}: expected exactly one production build`);
	const chunks = built[0].output.filter((file) => file.type === 'chunk');
	assert.equal(chunks.length, 1, `${scenario.name}: expected exactly one executable bundle`);
	const chunk = chunks[0];
	assert.deepEqual(
		chunk.imports,
		[],
		`${scenario.name}: unexpected external production dependency`,
	);
	assert.deepEqual(
		chunk.dynamicImports,
		[],
		`${scenario.name}: deferred dependency escaped the measured production bundle`,
	);
	const modules = Object.entries(chunk.modules)
		.filter(([, module]) => !scenario.package || module.renderedLength > 0)
		.map(([id]) => id);
	const runtimeModule = modules.find((id) => id.endsWith('/packages/octane/src/runtime.ts'));
	return {
		code: chunk.code,
		modules,
		runtimeExports: runtimeModule ? chunk.modules[runtimeModule].renderedExports : [],
	};
}

try {
	for (const scenario of scenarios) {
		const { id, name } = scenario;
		const entry = path.join(fixtures, `${id}.${scenario.extension}`);
		const { code, modules, runtimeExports } = await buildScenario(scenario, entry);
		for (const [label, pattern] of forbidden) {
			const leaked = modules.find((id) => pattern.test(id));
			assert.equal(leaked, undefined, `${name}: ${label} reached the production bundle: ${leaked}`);
		}
		const hasRuntime = modules.some((module) => module.endsWith('/packages/octane/src/runtime.ts'));
		const hasVanillaStore = modules.some((id) => /\/node_modules\/zustand\//.test(id));
		if (id === 'capture-only' || id === 'binding-vanilla' || id === 'binding-floating-ui') {
			assert.equal(hasRuntime, false, `${name}: unrelated client runtime reached isolated entry`);
		} else if (id !== 'binding-motion' && id !== 'binding-aria') {
			assert.equal(hasRuntime, true, `${name}: executable feature omitted the client runtime`);
		}
		if (id === 'root-static-specialized') {
			assert.equal(
				runtimeExports.includes('__createVoidRoot'),
				true,
				`${name}: the disposable application root lost compiler specialization`,
			);
			assert.equal(
				runtimeExports.includes('createRoot'),
				false,
				`${name}: the generic reusable-root API reached the specialized entry`,
			);
		} else if (id === 'root-static') {
			assert.equal(
				runtimeExports.includes('createRoot'),
				true,
				`${name}: the reusable public root was replaced by the disposable contract`,
			);
		}
		if (id === 'binding-vanilla' || id === 'binding-hooks') {
			assert.equal(hasVanillaStore, true, `${name}: real Zustand vanilla store was externalized`);
		} else {
			assert.equal(hasVanillaStore, false, `${name}: unused binding reached the client bundle`);
		}
		if (scenario.forbidden) {
			const leaked = modules.filter((module) => scenario.forbidden.test(module));
			assert.deepEqual(
				leaked,
				[],
				`${name}: unrelated ${scenario.package} exports reached the production bundle`,
			);
		}

		const snapshot = await verifyScenario(id, code);
		const bytes = Buffer.from(code);
		const measured = {
			raw: bytes.length,
			gzip: gzipSync(bytes, { level: zlib.Z_BEST_COMPRESSION }).length,
			brotli: brotliCompressSync(bytes, {
				params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY },
			}).length,
		};
		const budget = budgets[name];
		for (const metric of ['raw', 'gzip', 'brotli']) {
			assert.equal(
				Number.isSafeInteger(budget[metric]) && budget[metric] > 0,
				true,
				`${name}: invalid committed ${metric} byte budget`,
			);
		}
		payload.targets.push({
			name,
			ops: Object.fromEntries(
				Object.entries(measured).map(([metric, value]) => [metric, stat(value)]),
			),
			meta: {
				modules: modules.map((id) =>
					id.startsWith(repository + path.sep) ? path.relative(repository, id) : id,
				),
				hasRuntime,
				hasVanillaStore,
				...(scenario.package ? { bundler: scenario.bundler, package: scenario.package } : null),
				...(id.startsWith('root-static') ? { runtimeExports } : null),
				snapshot,
			},
		});
		payload.targets.push({
			name: `${name}-budget`,
			ops: Object.fromEntries(
				Object.entries(budget).map(([metric, value]) => [metric, stat(value)]),
			),
		});
		console.log(
			`${name.padEnd(32)} raw ${String(measured.raw).padStart(6)}  ` +
				`gzip ${String(measured.gzip).padStart(5)}  brotli ${String(measured.brotli).padStart(5)}`,
		);
	}
} catch (error) {
	payload.failed = error?.stack ?? String(error);
	console.error(`REACHABILITY FAIL: ${payload.failed}`);
	process.exitCode = 1;
} finally {
	if (process.env.BENCH_JSON) {
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	}
}
