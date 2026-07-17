import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { createShardPlan, readExampleInventory, runExampleShard } from './run-example-e2e.mjs';

describe('example E2E shard planning', () => {
	test('balances the current catalog and schedules every app exactly once', async () => {
		const apps = await readExampleInventory();
		const plan = createShardPlan(apps, 3);
		const scheduledIds = plan.shards.flatMap((shard) => shard.apps.map((app) => app.id));

		assert.deepEqual(
			[...scheduledIds].sort(),
			apps.map((app) => app.id),
		);
		assert.equal(new Set(scheduledIds).size, apps.length);
		assert.deepEqual(
			plan.shards.map((shard) => shard.estimatedWeight).sort((left, right) => left - right),
			[27, 28, 28],
		);
		assert.deepEqual(
			plan.shards.map((shard) => shard.apps.length).sort((left, right) => left - right),
			[4, 5, 5],
		);
	});

	test('accounts for dialects and wrapper scripts that repeat Playwright', async () => {
		const apps = await readExampleInventory();
		const byId = new Map(apps.map((app) => [app.id, app]));

		assert.deepEqual(
			['cartlane', 'hacker-news', 'pagecraft'].map((id) => ({
				id,
				executionModes: byId.get(id).executionModes,
				weight: byId.get(id).weight,
			})),
			[
				{ id: 'cartlane', executionModes: 2, weight: 10 },
				{ id: 'hacker-news', executionModes: 2, weight: 8 },
				{ id: 'pagecraft', executionModes: 2, weight: 10 },
			],
		);
	});

	test('is independent of catalog ordering', async () => {
		const apps = await readExampleInventory();
		const forward = createShardPlan(apps, 3);
		const reversed = createShardPlan([...apps].reverse(), 3);
		const memberships = (plan) => plan.shards.map((shard) => shard.apps.map((app) => app.id));

		assert.deepEqual(memberships(reversed), memberships(forward));
	});
});

describe('example E2E shard execution', () => {
	test('runs sequentially, stops after a failure, and publishes useful timings', async (t) => {
		const summaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'octane-example-e2e-'));
		t.after(() => rm(summaryDirectory, { force: true, recursive: true }));
		const summaryPath = path.join(summaryDirectory, 'summary.md');
		const apps = [
			{ id: 'alpha', title: 'Alpha', weight: 1 },
			{ id: 'bravo', title: 'Bravo', weight: 1 },
			{ id: 'charlie', title: 'Charlie', weight: 1 },
		];
		const calls = [];
		const output = [];
		let activeExecutions = 0;
		let clock = 0;
		const result = await runExampleShard({
			apps,
			shardIndex: 1,
			shardCount: 1,
			summaryPath,
			now: () => clock,
			logger: {
				log(message) {
					output.push(message);
				},
				error(message) {
					output.push(message);
				},
			},
			executor: async (app) => {
				activeExecutions += 1;
				assert.equal(activeExecutions, 1, 'apps must not overlap');
				calls.push(app.id);
				clock += app.id === 'alpha' ? 1200 : 2500;
				await Promise.resolve();
				activeExecutions -= 1;
				return { exitCode: app.id === 'bravo' ? 17 : 0 };
			},
		});

		assert.equal(result.exitCode, 17);
		assert.deepEqual(calls, ['alpha', 'bravo']);
		assert.deepEqual(
			result.timings.map(({ app, status }) => [app.id, status]),
			[
				['alpha', 'passed'],
				['bravo', 'failed'],
				['charlie', 'not-run'],
			],
		);
		assert.match(output.join('\n'), /Passed alpha in 1\.2s/);
		assert.match(output.join('\n'), /Failed bravo in 2\.5s/);

		const summary = await readFile(summaryPath, 'utf8');
		assert.match(summary, /Example E2E shard 1\/1/);
		assert.match(summary, /Alpha.*Passed.*1\.2s/);
		assert.match(summary, /Bravo.*Failed.*2\.5s/);
		assert.match(summary, /Charlie.*Not run.*—/);
		assert.match(summary, /Elapsed: \*\*3\.7s\*\*/);
	});
});
