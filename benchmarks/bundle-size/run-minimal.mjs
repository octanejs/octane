// Production public-import reachability: build and execute each independent
// feature entry before publishing deterministic byte totals and budget peers.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import { octane } from 'octane/compiler/vite';
import { build } from 'vite';
import { verifyScenario } from './verify-reachability.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');
const fixtures = path.join(directory, 'fixtures/minimal');
const budgetFile = path.join(directory, 'minimal-budgets.json');
const budgets = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
const scenarios = [
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

const expectedNames = new Set(scenarios.map(([name]) => name));
assert.deepEqual(
	Object.keys(budgets).sort(),
	[...expectedNames].sort(),
	'minimal-import budgets must cover every scenario exactly once',
);

const payload = { suite: 'bundle-reachability', iterations: 1, targets: [] };

try {
	for (const [name, extension] of scenarios) {
		const entry = path.join(fixtures, `${name}.${extension}`);
		const result = await build({
			configFile: false,
			root: directory,
			mode: 'production',
			logLevel: 'error',
			plugins: [octane({ hmr: false })],
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
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
		assert.equal(built.length, 1, `${name}: expected exactly one production build`);
		const chunks = built[0].output.filter((file) => file.type === 'chunk');
		assert.equal(chunks.length, 1, `${name}: expected exactly one executable bundle`);
		const chunk = chunks[0];
		assert.deepEqual(chunk.imports, [], `${name}: unexpected external production dependency`);
		assert.deepEqual(
			chunk.dynamicImports,
			[],
			`${name}: deferred dependency escaped the measured production bundle`,
		);

		const modules = Object.keys(chunk.modules);
		for (const [label, pattern] of forbidden) {
			const leaked = modules.find((id) => pattern.test(id));
			assert.equal(leaked, undefined, `${name}: ${label} reached the production bundle: ${leaked}`);
		}
		const runtimeModule = modules.find((id) => id.endsWith('/packages/octane/src/runtime.ts'));
		const hasRuntime = runtimeModule !== undefined;
		const runtimeExports = runtimeModule ? chunk.modules[runtimeModule].renderedExports : [];
		const hasVanillaStore = modules.some((id) => /\/node_modules\/zustand\//.test(id));
		if (name === 'capture-only' || name === 'binding-vanilla') {
			assert.equal(hasRuntime, false, `${name}: unrelated client runtime reached isolated entry`);
		} else {
			assert.equal(hasRuntime, true, `${name}: executable feature omitted the client runtime`);
		}
		if (name === 'root-static-specialized') {
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
		} else if (name === 'root-static') {
			assert.equal(
				runtimeExports.includes('createRoot'),
				true,
				`${name}: the reusable public root was replaced by the disposable contract`,
			);
		}
		if (name.startsWith('binding-')) {
			assert.equal(hasVanillaStore, true, `${name}: real Zustand vanilla store was externalized`);
		} else {
			assert.equal(hasVanillaStore, false, `${name}: unused binding reached the client bundle`);
		}

		const snapshot = await verifyScenario(name, chunk.code);
		const bytes = Buffer.from(chunk.code);
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
				...(name.startsWith('root-static') ? { runtimeExports } : null),
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
			`${name.padEnd(24)} raw ${String(measured.raw).padStart(6)}  ` +
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
