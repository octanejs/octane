import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import {
	checkBrowserErrors,
	chromium,
	closeResources,
	environmentFor,
	openCase,
	parseOptions,
	startFixture,
	writePayload,
} from './harness.mjs';
import {
	CAUGHT_REVEAL_LARGE_COUNT,
	CAUGHT_REVEAL_LARGE_INDICES,
	CAUGHT_REVEAL_SMALL_COUNT,
	CAUGHT_REVEAL_SMALL_INDICES,
} from './caught-reveal-contract.mjs';

const options = parseOptions(process.argv.slice(2), { iterations: true });
const WARMUP = 3;
const SCALE = CAUGHT_REVEAL_LARGE_COUNT / CAUGHT_REVEAL_SMALL_COUNT;
const target = 'octane-tsrx';
const failures = [];
let browser;
let fixture;
let sample;
const targets = [];

function stats(samples) {
	return timingStatForJson(summarizeSamples(samples), { p99: true });
}

try {
	browser = await chromium().launch({
		headless: true,
		args: ['--no-sandbox', '--js-flags=--expose-gc'],
	});
	fixture = await startFixture({ ...options, target, scenario: 'caught-reveal' });
	sample = await openCase(browser, fixture.url);
	const environment = environmentFor(browser);
	const gcBeforeSample = await sample.page.evaluate(() => typeof globalThis.gc === 'function');
	const cases = [
		{ name: 'small', count: CAUGHT_REVEAL_SMALL_COUNT, indices: CAUGHT_REVEAL_SMALL_INDICES },
		{ name: 'large', count: CAUGHT_REVEAL_LARGE_COUNT, indices: CAUGHT_REVEAL_LARGE_INDICES },
	];
	const collected = new Map();

	for (const fixtureCase of cases) {
		const rawSamples = {};
		const semanticChecksums = {};
		const ops = {};
		for (const operation of ['control', 'reports']) {
			semanticChecksums[operation] = await sample.page.evaluate(
				({ indices, operation }) => window.__caughtRevealBench.gate(indices, operation),
				{ indices: fixtureCase.indices, operation },
			);
			const durations = [];
			for (let index = 0; index < WARMUP + options.iterations; index++) {
				await sample.page.evaluate(
					({ indices, operation }) => window.__caughtRevealBench.prepare(indices, operation),
					{ indices: fixtureCase.indices, operation },
				);
				await sample.page.evaluate(() => globalThis.gc?.());
				const result = await sample.page.evaluate(() => {
					const duration = window.__caughtRevealBench.run();
					return { duration, snapshot: window.__caughtRevealBench.verify() };
				});
				await sample.page.evaluate(() => window.__caughtRevealBench.cleanup());
				checkBrowserErrors(`${target}/caught-reveal-${fixtureCase.name}`, sample.errors);
				semanticChecksums[operation] = result.snapshot;
				if (index >= WARMUP) durations.push(result.duration);
			}
			rawSamples[operation] = durations;
			ops[operation] = stats(durations);
			console.log(`PASS activity/${target}-caught-reveal-${fixtureCase.name}/${operation}`);
		}
		collected.set(fixtureCase.name, rawSamples);
		targets.push({
			name: `${target}-caught-reveal-${fixtureCase.name}`,
			ops,
			meta: {
				...fixture.meta,
				environment,
				gcBeforeSample,
				count: fixtureCase.count,
				warmup: WARMUP,
				correctness: 'pass',
				rawSamples,
				semanticChecksums,
			},
		});
	}

	const normalizedSamples = Object.fromEntries(
		Object.entries(collected.get('large')).map(([operation, samples]) => [
			operation,
			samples.map((duration) => duration / SCALE),
		]),
	);
	targets.push({
		name: `${target}-caught-reveal-large-normalized`,
		ops: Object.fromEntries(
			Object.entries(normalizedSamples).map(([operation, samples]) => [operation, stats(samples)]),
		),
		meta: {
			...fixture.meta,
			environment,
			gcBeforeSample,
			count: CAUGHT_REVEAL_LARGE_COUNT,
			normalizedTo: CAUGHT_REVEAL_SMALL_COUNT,
			warmup: WARMUP,
			correctness: 'pass',
			rawSamples: normalizedSamples,
		},
	});
} catch (error) {
	failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
	failures.push(...(await closeResources(sample?.context, fixture, browser)));
}

writePayload({
	suite: 'activity-caught-reveal',
	iterations: options.iterations,
	targets,
	...(failures.length ? { failed: failures.join('\n') } : {}),
});

if (targets.length) {
	console.table(
		targets.flatMap((result) =>
			Object.entries(result.ops).map(([operation, stat]) => ({
				target: result.name,
				operation,
				score_ms: Number(stat.score.toFixed(3)),
				median_ms: Number(stat.median.toFixed(3)),
				p95_ms: Number(stat.p95.toFixed(3)),
				rme_pct: Number(stat.rme.toFixed(1)),
			})),
		),
	);
}

if (failures.length) {
	console.error(`FAIL activity caught reveal: ${failures.join('\n')}`);
	process.exitCode = 1;
}
