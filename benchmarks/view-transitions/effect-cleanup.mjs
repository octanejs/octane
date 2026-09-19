// Deterministic work in the unchanged effectful-list fixtures, after a real
// completed native ViewTransition or the same plain-root setup. No timings or
// source instrumentation: count outermost function ranges in minified assets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
	countStat,
	hashOctaneSources,
	octanePackageAt,
	packageVersion,
	parseOptions,
	writePayload,
} from '../activity/harness.mjs';
import { OPS, effectGateErrors } from '../effectful-list/contract.mjs';
import { idleTransitionPrimer } from './idle-primer-plugin.mjs';

const repo = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const args = process.argv.slice(2);
assert.ok(
	args.every((arg) => arg.startsWith('--octane-revision=')),
	'Usage: node benchmarks/view-transitions/effect-cleanup.mjs [--octane-revision=SHA]',
);
const options = parseOptions(args);
const source = octanePackageAt(options.revision);
const require = createRequire(path.join(repo, 'package.json'));
const selected = createRequire(path.join(source.packageRoot, 'package.json'));
assert.equal(selected.resolve('octane'), path.join(source.packageRoot, 'src/index.ts'));
const { build, preview } = await import(pathToFileURL(require.resolve('vite')));
const { octane } = await import(pathToFileURL(selected.resolve('octane/compiler/vite')));
const { chromium } = require('playwright');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function hashFiles(root, files) {
	const digest = createHash('sha256');
	function visit(relative) {
		const file = path.join(root, relative);
		if (fs.statSync(file).isDirectory()) {
			for (const entry of fs.readdirSync(file).sort()) visit(path.join(relative, entry));
		} else digest.update(relative).update('\0').update(fs.readFileSync(file)).update('\0');
	}
	for (const file of files) visit(file);
	return digest.digest('hex');
}
const fixtureHash = (root) =>
	hashFiles(root, ['index.html', 'package.json', 'src', 'vite.config.js']);
const harnessFiles = [
	'benchmarks/view-transitions/effect-cleanup.mjs',
	'benchmarks/view-transitions/effect-cleanup-budget.json',
	'benchmarks/view-transitions/idle-primer.js',
	'benchmarks/view-transitions/idle-primer-plugin.mjs',
	'benchmarks/effectful-list/contract.mjs',
	'benchmarks/effectful-list/run.mjs',
	'benchmarks/activity/harness.mjs',
	'benchmarks/activity/contract.mjs',
];
const methods = ['stageTeardown', 'stageDeactivation'];
const budget = JSON.parse(
	fs.readFileSync(new URL('./effect-cleanup-budget.json', import.meta.url), 'utf8'),
);
const caseBudget = (name) =>
	Object.fromEntries(
		Object.entries(budget.observed[name.replace('vt-effect-cleanup-', '')]).map(
			([metric, value]) => [metric, value + budget.allowance],
		),
	);
const operations = OPS.filter((op) =>
	['clear', 'remount', 'remove_100_scattered'].includes(op.name),
);
assert.equal(operations.length, 3);
const metadata = {
	revision: source.revision,
	workingTree: !options.revision,
	sourceSha256: hashOctaneSources(source.packageRoot),
	compilerSourceSha256: hashFiles(source.packageRoot, ['src/compiler']),
	lockfileSha256: hash(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
	harnessSha256: hashFiles(repo, harnessFiles),
	node: process.version,
	platform: process.platform,
	arch: process.arch,
	osRelease: os.release(),
	cpu: os.cpus()[0]?.model,
	toolchain: {
		vite: packageVersion(require, 'vite'),
		esbuild: packageVersion(createRequire(require.resolve('vite')), 'esbuild'),
		tsrxCore: packageVersion(selected, '@tsrx/core'),
		tsrxOxc: packageVersion(selected, '@tsrx/oxc'),
		playwright: packageVersion(require, 'playwright'),
	},
	build: { target: 'esnext', minify: 'esbuild', hmr: false, profile: false },
	chromeArgs: ['--js-flags=--jitless'],
	countDefinition:
		'Sum of outermost function-range counts for all emitted JavaScript assets; nested basic-block ranges are not summed.',
	coverageWindow:
		'After primer, fixture mount/pre and resetFx, through one original operation and its original 50ms effect-gate yield.',
	exclusions:
		'Primer, setup/pre, resetFx, readiness checks, semantic snapshots, and final context teardown.',
	limitations:
		'Function entries are work counts, not CPU times, instructions, allocations, or native DOM work. Unreported functions receive zero only from their verified initial/pre-operation coverage inventory. Total calls and nonnegative idle-minus-cold calls have calibrated per-operation budgets; neither requires zero idle overhead.',
};
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-vt-effect-cleanup-'));
const targets = [];
const builds = [];
const failures = [];
const servers = [];
let browser;

function assertPrimer(report, mode) {
	assert.ok(report, 'Primer report is required');
	assert.equal(report.mode, mode);
	assert.equal(report.ready, true);
	assert.equal(report.removed, true);
	assert.equal(report.error, null);
	assert.equal(report.remainingTransitionAnimations, 0);
	assert.equal(report.nativeCalls, mode === 'idle' ? 1 : 0);
	assert.equal(report.updateCallbacks, mode === 'idle' ? 1 : 0);
	assert.deepEqual(report.outcomes, mode === 'idle' ? ['fulfilled', 'fulfilled', 'fulfilled'] : []);
}

// Verify each CDP script against its actual emitted bytes. Keep zero-count
// inventory separately from the operation window; never reuse earlier counts.
async function rememberCoverage(cdp, result, assets, origin, inventory, initial) {
	for (const asset of assets) {
		const url = `${origin}/${asset.file}`;
		const scripts = result.filter((script) => script.url === url);
		assert.ok(scripts.length <= 1, `${asset.file}: unique script`);
		if (initial) assert.equal(scripts.length, 1, `${asset.file}: loaded asset inventory`);
		const script = scripts[0];
		if (!script) continue;
		let known = inventory.get(asset.file);
		if (!known) {
			assert.ok(initial, `${asset.file}: initial inventory required`);
			const { scriptSource } = await cdp.send('Debugger.getScriptSource', {
				scriptId: script.scriptId,
			});
			assert.equal(
				hash(scriptSource),
				asset.sha256,
				`${asset.file}: browser executed emitted bytes`,
			);
			known = {
				scriptId: script.scriptId,
				url,
				initialCalls: 0,
				preOperationCalls: 0,
				functions: new Map(),
			};
			inventory.set(asset.file, known);
		}
		assert.equal(script.scriptId, known.scriptId, `${asset.file}: script identity`);
		let calls = 0;
		for (const fn of script.functions) {
			assert.ok(fn.ranges.length > 0);
			const range = fn.ranges[0];
			known.functions.set(`${range.startOffset}:${range.endOffset}`, {
				...fn,
				ranges: fn.ranges.map((r) => ({ ...r, count: 0 })),
			});
			calls += range.count;
		}
		if (initial) known.initialCalls = calls;
		else known.preOperationCalls += calls;
	}
}

function collectCoverage(result, assets, origin, inventory) {
	const output = {
		totalCalls: 0,
		driverCalls: Object.fromEntries(methods.map((method) => [method, 0])),
		assets: [],
	};
	for (const asset of assets) {
		const scripts = result.filter((script) => script.url === `${origin}/${asset.file}`);
		assert.ok(scripts.length <= 1, `${asset.file}: unique operation script`);
		const known = inventory.get(asset.file);
		assert.ok(known, `${asset.file}: initial load inventory required before zero filling`);
		const script = scripts[0];
		if (script)
			assert.equal(script.scriptId, known.scriptId, `${asset.file}: operation script identity`);
		const byRange = new Map(known.functions);
		for (const fn of script?.functions ?? []) {
			assert.ok(fn.ranges.length > 0);
			const range = fn.ranges[0];
			byRange.set(`${range.startOffset}:${range.endOffset}`, fn);
		}
		const functions = [...byRange.values()].sort(
			(a, b) => a.ranges[0].startOffset - b.ranges[0].startOffset,
		);
		for (const fn of functions)
			if (methods.includes(fn.functionName))
				output.driverCalls[fn.functionName] += fn.ranges[0].count;
		const totalCalls = functions.reduce((sum, fn) => sum + fn.ranges[0].count, 0);
		output.totalCalls += totalCalls;
		output.assets.push({
			file: asset.file,
			sha256: asset.sha256,
			totalCalls,
			functions,
			operationScriptReported: !!script,
			loadProvenance: {
				scriptId: known.scriptId,
				url: known.url,
				initialCalls: known.initialCalls,
				preOperationCalls: known.preOperationCalls,
			},
		});
	}
	return output;
}

process.env.NODE_ENV = 'production';
try {
	browser = await chromium.launch({ headless: true, args: metadata.chromeArgs });
	metadata.chromium = browser.version();
	for (const name of ['octane-tsrx', 'octane-jsx']) {
		const fixture = path.join(repo, 'benchmarks/effectful-list', name);
		const outDir = path.join(temporary, name);
		const compiledInputs = {};
		const primer = idleTransitionPrimer({ fixture, entry: 'src/main.js' });
		const info = { name, fixtureSourceSha256: fixtureHash(fixture), primer: primer.api };
		builds.push(info);
		const result = await build({
			configFile: false,
			root: fixture,
			mode: 'production',
			logLevel: 'error',
			plugins: [
				{
					name: 'selected-octane',
					enforce: 'pre',
					resolveId(id) {
						if (id === 'octane' || id.startsWith('octane/')) return selected.resolve(id);
					},
				},
				primer,
				octane({ hmr: false, profile: false }),
				{
					name: 'record-compiled-inputs',
					enforce: 'post',
					transform(code, id) {
						if (id.startsWith(path.join(fixture, 'src') + path.sep))
							compiledInputs[path.relative(fixture, id)] = hash(code);
					},
				},
			],
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			build: { target: 'esnext', minify: 'esbuild', outDir, emptyOutDir: true },
		});
		info.compiledInputSha256 = Object.fromEntries(Object.entries(compiledInputs).sort());
		info.assets = (Array.isArray(result) ? result : [result])
			.flatMap((item) => item.output)
			.sort((a, b) => a.fileName.localeCompare(b.fileName))
			.map((asset) => {
				const bytes = asset.type === 'chunk' ? asset.code : asset.source;
				return {
					file: asset.fileName,
					sha256: hash(bytes),
					rawBytes: Buffer.byteLength(bytes),
					gzipBytes: gzipSync(bytes, { level: 9 }).length,
				};
			});
		const assets = info.assets.filter((asset) => asset.file.endsWith('.js'));
		assert.ok(assets.length > 0);
		info.javascriptBytes = assets.reduce((sum, asset) => sum + asset.rawBytes, 0);
		info.javascriptGzipBytes = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
		const server = await preview({
			configFile: false,
			root: fixture,
			logLevel: 'error',
			build: { outDir },
			preview: { host: '127.0.0.1', port: 0, strictPort: true },
		});
		servers.push(server);
		const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
		for (const mode of ['cold', 'idle'])
			for (const op of operations) {
				const target = {
					name: `vt-effect-cleanup-${name.slice('octane-'.length)}-${mode}-${op.name}`,
					ops: {},
					meta: { fixture: name, mode, operation: op.name, operationCount: 1 },
				};
				targets.push(target);
				const context = await browser.newContext();
				try {
					const page = await context.newPage();
					const errors = [];
					page.on('pageerror', (error) => errors.push(String(error)));
					const cdp = await context.newCDPSession(page);
					await cdp.send('Debugger.enable');
					await cdp.send('Profiler.enable');
					await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
					await page.goto(`${origin}/?vt-primer=${mode}`, { waitUntil: 'load' });
					await page.waitForFunction(() => window.__ready === true, null, { timeout: 20_000 });
					target.meta.primer = await page.evaluate(() => window.__vtIdlePrimer);
					assertPrimer(target.meta.primer, mode);
					assert.deepEqual(errors, []);
					const inventory = new Map();
					await rememberCoverage(
						cdp,
						(await cdp.send('Profiler.takePreciseCoverage')).result,
						assets,
						origin,
						inventory,
						true,
					);
					await page.evaluate(() => window.__mount());
					await sleep(50);
					// Same operation, precondition, counter reset, and settle boundaries
					// as effectful-list/run.mjs. Its exact lifecycle oracle is shared.
					await page.evaluate((pre) => window[pre](), op.pre);
					await sleep(50);
					await page.evaluate(() => window.__resetFx());
					await rememberCoverage(
						cdp,
						(await cdp.send('Profiler.takePreciseCoverage')).result,
						assets,
						origin,
						inventory,
						false,
					);
					await page.evaluate((operation) => window[operation](), op.op);
					await sleep(50);
					target.meta.coverage = collectCoverage(
						(await cdp.send('Profiler.takePreciseCoverage')).result,
						assets,
						origin,
						inventory,
					);
					await cdp.send('Profiler.stopPreciseCoverage');
					target.meta.semantic = await page.evaluate(() => ({
						fx: { ...window.__fx },
						rows: document.querySelectorAll('tbody tr').length,
					}));
					target.meta.expected = { ...op.expect, rows: op.rowsAfter };
					assert.deepEqual(effectGateErrors(target.meta.semantic, op), []);
					assert.deepEqual(errors, []);
					// The native primer proves the feature executed. Also require that
					// its minified method is observable, so renaming/omission cannot
					// turn an unmeasured method into a passing zero.
					if (mode === 'idle') {
						const found = target.meta.coverage.assets
							.flatMap((asset) => asset.functions)
							.filter((fn) => fn.functionName === 'stageTeardown');
						assert.equal(
							found.length,
							1,
							'Exactly one installed stageTeardown coverage range is required',
						);
					}
					target.meta.fxGate = 'pass';
					target.ops = {
						stage_teardown_calls: countStat(target.meta.coverage.driverCalls.stageTeardown),
						total_calls: countStat(target.meta.coverage.totalCalls),
					};
					assert.ok(
						target.ops.total_calls.score <= caseBudget(target.name).total_calls,
						`Total function calls exceed budget: ${target.ops.total_calls.score} > ${caseBudget(target.name).total_calls}`,
					);
					assert.equal(
						target.ops.stage_teardown_calls.score,
						0,
						'Ordinary cleanup must not enter stageTeardown',
					);
					console.log(
						`${target.name}: ${target.ops.total_calls.score} asset calls; zero stageTeardown calls`,
					);
				} catch (error) {
					target.failed = error.stack ?? String(error);
					failures.push(`${target.name}: ${target.failed}`);
					console.error(failures.at(-1));
				} finally {
					await context.close();
				}
			}
	}
} catch (error) {
	failures.push(error.stack ?? String(error));
} finally {
	const cleanup = await Promise.allSettled([
		...(browser ? [browser.close()] : []),
		...servers.map((server) => server.close()),
	]);
	for (const result of cleanup)
		if (result.status === 'rejected') failures.push(String(result.reason));
	try {
		fs.rmSync(temporary, { recursive: true, force: true });
	} catch (error) {
		failures.push(error.stack ?? String(error));
	}
}
try {
	assert.equal(
		hashOctaneSources(source.packageRoot),
		metadata.sourceSha256,
		'Source changed during measurements',
	);
	assert.equal(
		hashFiles(repo, harnessFiles),
		metadata.harnessSha256,
		'Harness changed during measurements',
	);
	assert.equal(
		hash(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
		metadata.lockfileSha256,
		'Lockfile changed during measurements',
	);
	for (const info of builds)
		assert.equal(
			fixtureHash(path.join(repo, 'benchmarks/effectful-list', info.name)),
			info.fixtureSourceSha256,
			'Fixture changed during measurements',
		);
} catch (error) {
	failures.push(error.stack ?? String(error));
}
const comparison = [];
for (const dialect of ['tsrx', 'jsx'])
	for (const op of operations) {
		const cold = targets.find(
			(target) => target.name === `vt-effect-cleanup-${dialect}-cold-${op.name}`,
		);
		const idle = targets.find(
			(target) => target.name === `vt-effect-cleanup-${dialect}-idle-${op.name}`,
		);
		if (cold?.ops.total_calls && idle?.ops.total_calls) {
			const delta = idle.ops.total_calls.score - cold.ops.total_calls.score;
			comparison.push({
				dialect,
				operation: op.name,
				coldTotalCalls: cold.ops.total_calls.score,
				idleTotalCalls: idle.ops.total_calls.score,
				idleMinusColdCalls: delta,
			});
			idle.ops.idle_extra_calls = countStat(Math.max(0, delta));
			if (idle.ops.idle_extra_calls.score > caseBudget(idle.name).idle_extra_calls) {
				const failure = `${idle.name}: idle extra calls exceed budget: ${idle.ops.idle_extra_calls.score} > ${caseBudget(idle.name).idle_extra_calls}`;
				failures.push(failure);
				idle.failed = idle.failed ? `${idle.failed}\n${failure}` : failure;
			}
		}
	}
for (const name of Object.keys(budget.observed)) {
	targets.push({
		name: `vt-effect-cleanup-${name}-budget`,
		ops: Object.fromEntries(
			Object.entries(caseBudget(`vt-effect-cleanup-${name}`)).map(([metric, value]) => [
				metric,
				countStat(value),
			]),
		),
		meta: { allowance: budget.allowance, calibration: budget.calibration.sourceSha256 },
	});
}

targets.push({
	name: 'vt-effect-cleanup-model',
	ops: { stage_teardown_calls: countStat(1) },
	meta: {
		provenance: metadata,
		builds,
		comparison,
		semanticControl:
			'Zero stageTeardown entries, divided by a positive reference. Both original lifecycle gates and six completed native transition primers must pass.',
	},
});
writePayload({
	suite: 'view-transitions',
	meta: metadata,
	builds,
	comparison,
	targets,
	...(failures.length ? { failed: failures.join('\n') } : {}),
});
if (failures.length) process.exitCode = 1;
