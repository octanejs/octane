import { CYCLE_COUNT, ROW_COUNT, UPDATE_COUNT } from './contract.mjs';
import { REF_DEPTH, REF_LANES, REF_OPERATIONS } from './ref-contract.mjs';
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

const options = parseOptions(process.argv.slice(2), { iterations: true });
const WARMUP = 3;
const targets = [];
const failures = [];
let browser;

try {
	browser = await chromium().launch({
		headless: true,
		args: ['--no-sandbox', '--js-flags=--expose-gc'],
	});
	const environment = environmentFor(browser);
	for (const target of options.targets) {
		let fixture;
		try {
			fixture = await startFixture({ ...options, target, scenario: 'refs' });
			for (const lane of REF_LANES) {
				const sample = await openCase(browser, fixture.url);
				try {
					if (lane !== 'cold') {
						await sample.page.evaluate((value) => window.__activityRefBench.prime(value), lane);
					}
					const gcBeforeSample = await sample.page.evaluate(
						() => typeof globalThis.gc === 'function',
					);
					const ops = {};
					const rawSamples = {};
					const semanticChecksums = {};
					for (const operation of REF_OPERATIONS) {
						semanticChecksums[operation] = await sample.page.evaluate(
							(op) => window.__activityRefBench.gate(op),
							operation,
						);
						const durations = [];
						for (let index = 0; index < WARMUP + options.iterations; index++) {
							await sample.page.evaluate((op) => window.__activityRefBench.prepare(op), operation);
							await sample.page.evaluate(() => globalThis.gc?.());
							const result = await sample.page.evaluate((op) => {
								const api = window.__activityRefBench;
								const duration = api.run(op);
								const snapshot = api.verify(op);
								return { duration, snapshot };
							}, operation);
							await sample.page.evaluate(() => window.__activityRefBench.cleanup());
							checkBrowserErrors(`${target}/${lane}`, sample.errors);
							semanticChecksums[operation] = result.snapshot;
							if (index >= WARMUP) durations.push(result.duration);
						}
						rawSamples[operation] = durations;
						ops[operation] = timingStatForJson(summarizeSamples(durations), { p99: true });
						console.log(`PASS activity/${target}-refs-${lane}/${operation}`);
					}
					targets.push({
						name: `${target}-refs-${lane}`,
						ops,
						meta: {
							...fixture.meta,
							environment,
							gcBeforeSample,
							activityPrimed: lane !== 'cold',
							liveHiddenActivity: lane === 'live-hidden-activity',
							rows: ROW_COUNT,
							deepComponentLayers: REF_DEPTH,
							updatesPerSample: UPDATE_COUNT,
							cyclesPerSample: CYCLE_COUNT,
							warmup: WARMUP,
							correctness: 'pass',
							rawSamples,
							semanticChecksums,
						},
					});
					await sample.page.evaluate(() => window.__activityRefBench.finish());
					checkBrowserErrors(`${target}/${lane}`, sample.errors);
				} finally {
					await sample.context.close();
				}
			}
		} catch (error) {
			failures.push(
				`${target}: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
			);
		} finally {
			failures.push(...(await closeResources(fixture)));
		}
	}
} catch (error) {
	failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
	failures.push(...(await closeResources(browser)));
}

const expected = targets[0]?.meta.semanticChecksums;
for (const target of targets) {
	if (JSON.stringify(target.meta.semanticChecksums) !== JSON.stringify(expected)) {
		failures.push(`${target.name}: ordinary-ref semantic controls differ`);
	}
}

writePayload({
	suite: 'activity-refs',
	iterations: options.iterations,
	targets,
	...(failures.length ? { failed: failures.join('\n') } : {}),
});
if (targets.length) {
	console.table(
		targets.flatMap((target) =>
			Object.entries(target.ops).map(([operation, stat]) => ({
				target: target.name,
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
	console.error(`FAIL activity refs: ${failures.join('\n')}`);
	process.exitCode = 1;
}
