import { CYCLE_COUNT, ROW_COUNT, UPDATE_COUNT, WORK_OPERATIONS } from './contract.mjs';
import { collectPreciseCalls } from '../lib/precise-work.mjs';
import {
	checkBrowserErrors,
	chromium,
	closeResources,
	countStat,
	environmentFor,
	openCase,
	parseOptions,
	startFixture,
	writePayload,
} from './harness.mjs';

const options = parseOptions(process.argv.slice(2));
const METRICS = [
	'activityBlock',
	'hideActivityRange',
	'rehideActivityAfterDescendantRender',
	'enforceHiddenDisplay',
	'retainHiddenDisplay',
	'releaseHiddenDisplay',
	'deactivateScope',
	'forEachSubtreeChild',
	'detachSubtreeRefs',
	'collectVisibleSubtreeRefs',
	'hideActivityRefs',
	'queueCurrentActivityRefs',
	'snapshotSubtreeEffectDeps',
	'journalForSlot',
	'renderBlock',
];
const targets = [];
const failures = [];
let browser;

try {
	browser = await chromium().launch({
		headless: true,
		args: ['--no-sandbox', '--js-flags=--jitless'],
	});
	const environment = environmentFor(browser, { jitless: true });
	for (const target of options.targets) {
		let fixture;
		let sample;
		try {
			fixture = await startFixture({ ...options, target, work: true });
			const ops = {};
			const observations = {};
			for (const operation of WORK_OPERATIONS) {
				let calls = {};
				if (target === 'octane-tsrx') {
					calls = await collectPreciseCalls(browser, {
						url: fixture.url,
						before: [{ name: '__activityPrepare', arg: operation }],
						operation: { name: '__activityRun', arg: operation },
						after: [
							{ name: '__activityVerify', arg: operation },
							'__activityConfirm',
							'__activityCleanup',
						],
						metrics: METRICS,
					});
					for (const [metric, value] of Object.entries(calls)) {
						ops[`${operation}_${metric}`] = countStat(value);
					}
				}
				// MutationObserver sees real browser writes, including repeated writes
				// of an unchanged style. It is enabled only in this untimed work pass.
				sample = await openCase(browser, fixture.url);
				await sample.page.evaluate((op) => window.__activityBench.prepare(op), operation);
				const observed = await sample.page.evaluate(
					(op) => window.__activityBench.observeWork(op),
					operation,
				);
				await sample.page.evaluate(() => window.__activityBench.confirm());
				await sample.page.evaluate(() => window.__activityBench.cleanup());
				checkBrowserErrors(target, sample.errors);
				await sample.context.close();
				sample = undefined;
				for (const [metric, value] of Object.entries(observed.counts)) {
					ops[`${operation}_${metric}`] = countStat(value);
				}
				observations[operation] = {
					calls,
					dom: observed.counts,
					semanticChecksum: observed.snapshot,
				};
				console.log(
					`PASS activity/${target}-work/${operation}: ${JSON.stringify(observations[operation])}`,
				);
			}
			targets.push({
				name: `${target}-work`,
				ops,
				meta: { ...fixture.meta, environment, correctness: 'pass', observations },
			});
		} catch (error) {
			failures.push(
				`${target}: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
			);
		} finally {
			failures.push(...(await closeResources(sample?.context, fixture)));
		}
	}
	// Meaningful public-work denominators, not a second implementation. This
	// target lets reviewed deterministic ceilings survive machine-speed changes.
	const budget = {};
	for (const operation of WORK_OPERATIONS) {
		const rowVisits =
			operation === 'hide_reveal' || operation === 'nested_hide_reveal'
				? ROW_COUNT * CYCLE_COUNT
				: operation === 'hidden_burst' || operation === 'plain_updates'
					? ROW_COUNT * UPDATE_COUNT
					: ROW_COUNT;
		for (const metric of [...METRICS, 'styleWrites', 'stateAttributeWrites']) {
			budget[`${operation}_${metric}`] = countStat(rowVisits);
		}
		if (operation === 'hidden_descendant_updates') {
			// All retained row setters belong to one boundary and one public flush.
			// This denominator catches a range scan per row even if row count changes.
			budget[`${operation}_hideActivityRange`] = countStat(1);
			budget[`${operation}_rehideActivityAfterDescendantRender`] = countStat(1);
		}
		budget[`${operation}_addedRows`] = countStat(1);
		budget[`${operation}_removedRows`] = countStat(1);
	}
	targets.push({
		name: 'activity-work-model',
		ops: budget,
		meta: { rows: ROW_COUNT, updates: UPDATE_COUNT, cycles: CYCLE_COUNT },
	});
} catch (error) {
	failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
	failures.push(...(await closeResources(browser)));
}

const react = targets.find((target) => target.name === 'react-work');
const octane = targets.find((target) => target.name === 'octane-tsrx-work');
if (react && octane) {
	for (const operation of WORK_OPERATIONS) {
		if (
			JSON.stringify(react.meta.observations[operation].semanticChecksum) !==
			JSON.stringify(octane.meta.observations[operation].semanticChecksum)
		) {
			failures.push(`Octane and React produced different ${operation} work controls`);
		}
	}
}

// Work observations must not overwrite the timing run's iteration count.
writePayload({
	suite: 'activity-work',
	targets,
	...(failures.length ? { failed: failures.join('\n') } : {}),
});
if (failures.length) {
	console.error(`FAIL activity work: ${failures.join('\n')}`);
	process.exitCode = 1;
}
