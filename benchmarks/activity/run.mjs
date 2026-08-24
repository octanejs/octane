import {
	ASYNC_OPERATIONS,
	CYCLE_COUNT,
	GROUP_SIZE,
	OPERATIONS,
	ROW_COUNT,
	UPDATE_COUNT,
} from './contract.mjs';
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
		let sample;
		try {
			fixture = await startFixture({ ...options, target });
			sample = await openCase(browser, fixture.url);
			const gcBeforeSample = await sample.page.evaluate(() => typeof globalThis.gc === 'function');
			const ops = {};
			const rawSamples = {};
			const semanticChecksums = {};
			for (const operation of OPERATIONS) {
				// Intermediate nested visibility is checked outside timing; every timed
				// sample independently verifies all state, effects, identities and text.
				semanticChecksums[operation] = await sample.page.evaluate(
					(op) => window.__activityBench.gate(op),
					operation,
				);
				const commits = [];
				const completions = [];
				for (let index = 0; index < WARMUP + options.iterations; index++) {
					await sample.page.evaluate((op) => window.__activityBench.prepare(op), operation);
					await sample.page.evaluate(() => globalThis.gc?.());
					const result = await sample.page.evaluate(async (op) => {
						const api = window.__activityBench;
						const times = await api.run(op);
						const snapshot = api.verify(op);
						return { times, snapshot };
					}, operation);
					await sample.page.evaluate(() => window.__activityBench.confirm());
					await sample.page.evaluate(() => window.__activityBench.cleanup());
					checkBrowserErrors(target, sample.errors);
					semanticChecksums[operation] = result.snapshot;
					if (index >= WARMUP) {
						commits.push(result.times.commitMs);
						completions.push(result.times.readyMs);
					}
				}
				if (ASYNC_OPERATIONS.has(operation)) {
					rawSamples[`${operation}_commit`] = commits;
					rawSamples[`${operation}_ready`] = completions;
				} else rawSamples[operation] = commits;
				console.log(`PASS activity/${target}/${operation}`);
			}
			for (const [operation, samples] of Object.entries(rawSamples)) {
				ops[operation] = timingStatForJson(summarizeSamples(samples), { p99: true });
			}
			targets.push({
				name: target,
				ops,
				meta: {
					...fixture.meta,
					environment,
					gcBeforeSample,
					rows: ROW_COUNT,
					groupSize: GROUP_SIZE,
					updatesPerSample: UPDATE_COUNT,
					cyclesPerSample: CYCLE_COUNT,
					warmup: WARMUP,
					correctness: 'pass',
					rawSamples,
					semanticChecksums,
				},
			});
		} catch (error) {
			failures.push(
				`${target}: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
			);
		} finally {
			failures.push(...(await closeResources(sample?.context, fixture)));
		}
	}
} catch (error) {
	failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
	failures.push(...(await closeResources(browser)));
}

const react = targets.find((target) => target.name === 'react');
const octane = targets.find((target) => target.name === 'octane-tsrx');
if (
	react &&
	octane &&
	JSON.stringify(react.meta.semanticChecksums) !== JSON.stringify(octane.meta.semanticChecksums)
) {
	failures.push('Octane and React produced different Activity semantic checksums');
}

writePayload({
	suite: 'activity',
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
	console.error(`FAIL activity: ${failures.join('\n')}`);
	process.exitCode = 1;
}
