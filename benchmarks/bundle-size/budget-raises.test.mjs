import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBudgetRaises, findBudgetRaises } from './budget-raises.mjs';

const MINIMAL = 'benchmarks/bundle-size/minimal-budgets.json';
const APP = 'benchmarks/bundle-size/app-budgets.json';

test('only grown values that exist on both sides are raises', () => {
	const before = {
		context: { raw: 100, gzip: 50, brotli: 40 },
		rows: { app: { gzip: 10 }, total: { gzip: 20 } },
	};
	const after = {
		context: { raw: 90, gzip: 51, brotli: 40 },
		rows: { app: { gzip: 10 }, total: { gzip: 21 } },
		added: { raw: 999, gzip: 999, brotli: 999 },
	};
	assert.deepEqual(findBudgetRaises(MINIMAL, before, after), [
		{ budget: `${MINIMAL}: context.gzip`, before: 50, after: 51 },
		{ budget: `${MINIMAL}: rows.total.gzip`, before: 20, after: 21 },
	]);
	assert.deepEqual(findBudgetRaises(MINIMAL, null, after), []);
});

test('a raise alone, with prose, is allowed', () => {
	const raises = [{ budget: `${MINIMAL}: context.gzip`, before: 50, after: 51 }];
	assert.deepEqual(
		checkBudgetRaises({
			raises,
			changedFiles: [MINIMAL, APP, 'CONTRIBUTING.md', '.changeset/x.md'],
		}),
		[],
	);
});

test('a raise beside any other change fails and names both', () => {
	const raises = [{ budget: `${MINIMAL}: context.gzip`, before: 50, after: 51 }];
	const problems = checkBudgetRaises({
		raises,
		changedFiles: [MINIMAL, 'packages/octane/src/runtime.ts'],
	});
	assert.match(problems.join('\n'), /raises 1 committed byte budget\(s\) and also changes 1 other/);
	assert.match(problems.join('\n'), /context\.gzip 50 -> 51/);
	assert.match(problems.join('\n'), /packages\/octane\/src\/runtime\.ts/);
});

test('lowering budgets in a feature change is allowed', () => {
	assert.deepEqual(
		checkBudgetRaises({ raises: [], changedFiles: [MINIMAL, 'packages/octane/src/runtime.ts'] }),
		[],
	);
});
