import { LANES, ROW_COUNT, UPDATE_COUNT, operationsFor } from './contract.mjs';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import {
	checkBrowserErrors,
	chromium,
	closeResources,
	openCase,
	startFixture,
	writePayload,
} from './harness.mjs';

const args = process.argv.slice(2);
const iterations = Number(args.find((value) => !value.startsWith('--')) ?? '8');
const WARMUP = 3;
if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Hook/store iterations must be a positive integer');
}

const targets = [];
let fixture;
let browser;
let failure;
try {
	fixture = await startFixture({ noBuild: args.includes('--no-build') });
	browser = await chromium().launch({
		headless: true,
		args: ['--no-sandbox', '--js-flags=--expose-gc'],
	});
	const environment = {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		chromium: browser.version(),
	};
	for (const lane of LANES) {
		const sample = await openCase(browser, fixture.url, lane);
		try {
			const gcBeforeSample = await sample.page.evaluate(() => typeof globalThis.gc === 'function');
			const ops = {};
			const semanticChecksums = {};
			for (const operation of operationsFor(lane)) {
				const durations = [];
				for (let index = 0; index < WARMUP + iterations; index++) {
					await sample.page.evaluate((op) => window.__hookStoreBench.prepare(op), operation);
					await sample.page.evaluate(() => globalThis.gc?.());
					// Stop the timer before verification, but verify in the same browser
					// task. A renderer cannot finish omitted work in a microtask between
					// the timed flush and its visible-output oracle.
					const result = await sample.page.evaluate((op) => {
						const api = window.__hookStoreBench;
						const started = performance.now();
						api.run(op);
						const duration = performance.now() - started;
						const snapshot = api.verify(op);
						return { duration, snapshot };
					}, operation);
					await sample.page.evaluate(() => window.__hookStoreBench.confirmLiveWrite());
					await sample.page.evaluate(() => window.__hookStoreBench.cleanup());
					checkBrowserErrors(lane, sample.errors);
					semanticChecksums[operation] = result.snapshot;
					if (index >= WARMUP) durations.push(result.duration);
				}
				ops[operation] = timingStatForJson(summarizeSamples(durations), { p99: true });
			}
			targets.push({
				name: lane,
				ops,
				meta: {
					browser: 'chromium',
					environment,
					gcBeforeSample,
					rows: ROW_COUNT,
					updatesPerSample: UPDATE_COUNT,
					warmup: WARMUP,
					correctness: 'pass',
					semanticChecksums,
				},
			});
			console.log(`PASS hook-store-composition/${lane}: ${iterations} samples per operation`);
		} finally {
			await sample.context.close();
		}
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
	const cleanupFailures = await closeResources(browser, fixture);
	if (cleanupFailures.length !== 0) {
		failure = [failure, ...cleanupFailures].filter(Boolean).join('\n');
	}
}

writePayload({
	suite: 'hook-store-composition',
	iterations,
	targets,
	...(failure ? { failed: failure } : {}),
});
if (targets.length !== 0) {
	console.table(
		targets.flatMap((target) =>
			Object.entries(target.ops).map(([operation, stat]) => ({
				lane: target.name,
				operation,
				score_ms: Number((stat.score ?? stat.median).toFixed(3)),
				median_ms: Number(stat.median.toFixed(3)),
				p95_ms: Number(stat.p95.toFixed(3)),
				rme_pct: Number(stat.rme.toFixed(1)),
			})),
		),
	);
}
if (failure) {
	console.error(`FAIL hook-store-composition: ${failure}`);
	process.exitCode = 1;
}
