import {
	CALLBACK_LANES,
	ROW_COUNT,
	STORE_LANES,
	UPDATE_COUNT,
	operationsFor,
} from './contract.mjs';
import { collectPreciseCalls } from '../lib/precise-work.mjs';
import {
	checkBrowserErrors,
	chromium,
	closeResources,
	fixtureUrl,
	openCase,
	startFixture,
	writePayload,
} from './harness.mjs';

const METRICS = [
	'useCallback',
	'useMemo',
	'resolveHookArgs',
	'resolveSlot',
	'appendSlotKey',
	'withSlot',
];
const SELECTION_COUNTERS = ['selectorCalls', 'snapshotReads'];
const VANILLA_COUNTERS = [
	'notifications',
	'subscribeCalls',
	'unsubscribeInvocations',
	'unsubscribeCalls',
	'duplicateUnsubscribes',
];
const MOBX_COUNTERS = ['observedTransitions', 'unobservedTransitions'];
const countStat = (value) => {
	if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid work count: ${value}`);
	return { median: value, min: value, samples: 1 };
};
const expectedCallbacks = ROW_COUNT * UPDATE_COUNT;
const targets = [];
let fixture;
let browser;
let failure;

function ensure(condition, message) {
	if (!condition) throw new Error(message);
}

try {
	fixture = await startFixture({ work: true, noBuild: process.argv.includes('--no-build') });
	browser = await chromium().launch({
		headless: true,
		args: ['--no-sandbox', '--js-flags=--jitless'],
	});
	const environment = {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		chromium: browser.version(),
		jitless: true,
	};
	for (const lane of CALLBACK_LANES) {
		const ops = {};
		const observations = {};
		for (const operation of operationsFor(lane)) {
			const counts = await collectPreciseCalls(browser, {
				url: fixtureUrl(fixture.url, lane),
				before: [{ name: '__hookStorePrepare', arg: operation }],
				operation: { name: '__hookStoreRun', arg: operation },
				after: [{ name: '__hookStoreVerify', arg: operation }, '__hookStoreCleanup'],
				metrics: METRICS,
			});
			ensure(
				counts.useCallback >= expectedCallbacks,
				`${lane}/${operation}: only ${counts.useCallback} runtime callbacks; expected at least ${expectedCallbacks}`,
			);
			ensure(counts.resolveSlot > 0, `${lane}/${operation}: no slot-resolution coverage`);
			if (lane === 'callback-nested') {
				ensure(counts.withSlot > 0, `${lane}/${operation}: no custom-hook composition coverage`);
				ensure(counts.appendSlotKey > 0, `${lane}/${operation}: no composed-slot coverage`);
			}
			observations[operation] = { expectedCallbacks, ...counts };
			for (const metric of METRICS) {
				ops[`${operation}_${metric}`] = countStat(counts[metric]);
			}
			ops[`${operation}_intended_callbacks`] = countStat(expectedCallbacks);
		}
		targets.push({
			name: `${lane}-work`,
			ops,
			meta: { correctness: 'pass', environment, observations },
		});
	}

	// Selector/read/lifecycle probes use separate fixture instances whose owned
	// stores install diagnostic delegates. These are never timing samples.
	for (const lane of STORE_LANES) {
		const sample = await openCase(browser, fixture.url, lane, true);
		try {
			const counters = [
				...SELECTION_COUNTERS,
				...(lane === 'raw-store' ? [] : ['equalityCalls']),
				...(lane === 'mobx' ? MOBX_COUNTERS : VANILLA_COUNTERS),
			];
			const ops = {};
			const observations = {};
			for (const operation of operationsFor(lane)) {
				await sample.page.evaluate((op) => window.__hookStoreBench.prepare(op), operation);
				const result = await sample.page.evaluate((op) => {
					const api = window.__hookStoreBench;
					const before = api.diagnostics();
					api.run(op);
					const after = api.diagnostics();
					const snapshot = api.verify(op);
					return { before, after, snapshot };
				}, operation);
				await sample.page.evaluate(() => window.__hookStoreBench.confirmLiveWrite());
				const cleanup = await sample.page.evaluate(() => window.__hookStoreBench.cleanup());
				checkBrowserErrors(lane, sample.errors);
				const delta = Object.fromEntries(
					counters.map((counter) => [counter, result.after[counter] - result.before[counter]]),
				);
				for (const [counter, value] of Object.entries(delta)) {
					ops[`${operation}_${counter}`] = countStat(value);
				}
				const cleanupMetrics = Object.fromEntries(
					[...counters, 'retainedSubscribers', 'subscriptionKind'].map((counter) => [
						counter,
						cleanup[counter],
					]),
				);
				observations[operation] = {
					delta,
					cleanup: cleanupMetrics,
					semanticChecksum: result.snapshot,
				};
			}
			targets.push({
				name: `${lane}-work`,
				ops,
				meta: {
					correctness: 'pass',
					environment,
					equalityKind:
						lane === 'raw-store'
							? 'runtime Object.is (not instrumented)'
							: lane === 'mobx'
								? 'computed value comparator'
								: 'user selection comparator',
					observations,
				},
			});
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

// No iterations field: the unified runner merges this untimed invocation with
// the timing results without replacing their actual sample count.
writePayload({
	suite: 'hook-store-composition-work',
	targets,
	...(failure ? { failed: failure } : {}),
});
if (failure) {
	console.error(`FAIL hook-store-composition work: ${failure}`);
	process.exitCode = 1;
} else {
	console.log('PASS hook-store-composition: production call counts and lifecycle controls');
	for (const target of targets)
		console.log(`${target.name}: ${JSON.stringify(target.meta.observations)}`);
}
