import { calibratedReps, roundOrder } from '../lib/paired.mjs';
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
// Ceiling on the large case's roots per sample (the small case gets SCALE times
// as many).
const MAX_LARGE_COPIES = 32;
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
	const operations = ['control', 'reports'];
	const perCase = new Map(
		cases.map((fixtureCase) => [
			fixtureCase.name,
			{ rawSamples: {}, semanticChecksums: {}, ops: {}, copies: {} },
		]),
	);

	// One sample: reveal `copies` independent hidden roots in one timed window.
	// Root creation, hidden rendering, and GC stay outside the timer, and every
	// root is verified afterwards. Returns the time per revealed root.
	async function sampleCase(fixtureCase, operation, copies) {
		await sample.page.evaluate(
			({ indices, operation, copies }) =>
				window.__caughtRevealBench.prepare(indices, operation, copies),
			{ indices: fixtureCase.indices, operation, copies },
		);
		await sample.page.evaluate(() => globalThis.gc?.());
		const result = await sample.page.evaluate(() => {
			const duration = window.__caughtRevealBench.run();
			return { duration, snapshot: window.__caughtRevealBench.verify() };
		});
		await sample.page.evaluate(() => window.__caughtRevealBench.cleanup());
		checkBrowserErrors(`${target}/caught-reveal-${fixtureCase.name}`, sample.errors);
		perCase.get(fixtureCase.name).semanticChecksums[operation] = result.snapshot;
		return result.duration / copies;
	}

	for (const operation of operations) {
		for (const fixtureCase of cases) {
			perCase.get(fixtureCase.name).semanticChecksums[operation] = await sample.page.evaluate(
				({ indices, operation }) => window.__caughtRevealBench.gate(indices, operation),
				{ indices: fixtureCase.indices, operation },
			);
		}

		// Roots per sample: the large case scales toward a ~20 ms sample, and the
		// small case reveals SCALE times as many roots, so both samples reveal
		// the same number of boundaries and the normalized ratio compares equal
		// work. The second of two single-root reveals sets the count.
		const large = cases[1];
		await sampleCase(large, operation, 1);
		const perRoot = await sampleCase(large, operation, 1);
		const largeCopies = calibratedReps(1, perRoot, MAX_LARGE_COPIES);
		const copiesFor = (fixtureCase) => (fixtureCase === large ? largeCopies : largeCopies * SCALE);

		// Pair the cases per round, alternating which runs first.
		const durations = new Map(cases.map((fixtureCase) => [fixtureCase, []]));
		for (let index = 0; index < WARMUP + options.iterations; index++) {
			for (const fixtureCase of roundOrder(cases, index)) {
				const duration = await sampleCase(fixtureCase, operation, copiesFor(fixtureCase));
				if (index >= WARMUP) durations.get(fixtureCase).push(duration);
			}
		}
		for (const fixtureCase of cases) {
			const entry = perCase.get(fixtureCase.name);
			entry.rawSamples[operation] = durations.get(fixtureCase);
			entry.ops[operation] = stats(durations.get(fixtureCase));
			entry.copies[operation] = copiesFor(fixtureCase);
			console.log(
				`PASS activity/${target}-caught-reveal-${fixtureCase.name}/${operation} ` +
					`(${copiesFor(fixtureCase)} roots per sample)`,
			);
		}
	}

	for (const fixtureCase of cases) {
		const { rawSamples, semanticChecksums, ops, copies } = perCase.get(fixtureCase.name);
		targets.push({
			name: `${target}-caught-reveal-${fixtureCase.name}`,
			ops,
			meta: {
				...fixture.meta,
				environment,
				gcBeforeSample,
				count: fixtureCase.count,
				rootsPerSample: copies,
				warmup: WARMUP,
				correctness: 'pass',
				rawSamples,
				semanticChecksums,
			},
		});
	}

	const normalizedSamples = Object.fromEntries(
		Object.entries(perCase.get('large').rawSamples).map(([operation, samples]) => [
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
			rootsPerSample: perCase.get('large').copies,
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
