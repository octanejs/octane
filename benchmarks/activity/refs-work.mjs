import { CYCLE_COUNT, ROW_COUNT, UPDATE_COUNT } from './contract.mjs';
import { REF_DEPTH, REF_LANES, REF_OPERATIONS } from './ref-contract.mjs';
import { collectPreciseCalls } from '../lib/precise-work.mjs';
import {
	chromium,
	closeResources,
	countStat,
	environmentFor,
	parseOptions,
	startFixture,
	writePayload,
} from './harness.mjs';

const options = parseOptions(process.argv.slice(2));
const METRICS = [
	'queueRefAttach',
	'queueRefDetach',
	'attachRef',
	'drainRefAttaches',
	'drainRefDetaches',
	'findHiddenActivity',
	'findActivityRefOwners',
	'registerActivityRef',
	'hideActivityRefs',
	'queueCurrentActivityRefs',
];
const targets = [];
const failures = [];
let browser;
let fixture;

try {
	browser = await chromium().launch({
		headless: true,
		args: ['--no-sandbox', '--js-flags=--jitless'],
	});
	const environment = environmentFor(browser, { jitless: true });
	if (options.targets.includes('octane-tsrx')) {
		fixture = await startFixture({
			...options,
			target: 'octane-tsrx',
			scenario: 'refs',
			work: true,
		});
		for (const lane of REF_LANES) {
			const ops = {};
			const observations = {};
			for (const operation of REF_OPERATIONS) {
				const calls = await collectPreciseCalls(browser, {
					url: fixture.url,
					before: [
						...(lane !== 'cold' ? [{ name: '__activityRefPrime', arg: lane }] : []),
						{ name: '__activityRefPrepare', arg: operation },
					],
					operation: { name: '__activityRefRun', arg: operation },
					after: [
						{ name: '__activityRefVerify', arg: operation },
						'__activityRefCleanup',
						'__activityRefFinish',
					],
					metrics: METRICS,
				});
				for (const [metric, value] of Object.entries(calls)) {
					ops[`${operation}_${metric}`] = countStat(value);
				}
				observations[operation] = calls;
				console.log(`PASS activity/refs-${lane}-work/${operation}: ${JSON.stringify(calls)}`);
			}
			targets.push({
				name: `octane-tsrx-refs-${lane}-work`,
				ops,
				meta: {
					...fixture.meta,
					environment,
					rows: ROW_COUNT,
					deepComponentLayers: REF_DEPTH,
					activityPrimed: lane !== 'cold',
					liveHiddenActivity: lane === 'live-hidden-activity',
					correctness: 'pass',
					observations,
				},
			});
		}
		const budget = {};
		for (const operation of REF_OPERATIONS) {
			const pairs = ROW_COUNT * (operation === 'ref_mount_unmount' ? CYCLE_COUNT : UPDATE_COUNT);
			for (const metric of METRICS) budget[`${operation}_${metric}`] = countStat(pairs);
		}
		targets.push({ name: 'activity-ref-model', ops: budget, meta: { rows: ROW_COUNT } });
	}
} catch (error) {
	failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
} finally {
	failures.push(...(await closeResources(browser, fixture)));
}

writePayload({
	suite: 'activity-refs-work',
	targets,
	...(failures.length ? { failed: failures.join('\n') } : {}),
});
if (failures.length) {
	console.error(`FAIL activity refs work: ${failures.join('\n')}`);
	process.exitCode = 1;
}
