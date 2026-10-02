import { beforeAll, describe, expect, it } from 'vitest';
import { signalsMutations } from '../../../../scripts/signals-mutations/rows.mjs';
import { classifyMutation, runMutation } from '../../../../scripts/signals-mutations/runner.mjs';
import { mutationOwners } from '../../../../scripts/signals-mutations/discovery.mjs';

const [row] = signalsMutations;
let normal: Awaited<ReturnType<typeof runMutation>>;
beforeAll(async () => {
	normal = await runMutation(row, 'normal');
	expect(normal.status, JSON.stringify(normal)).toBe('passed');
}, 75_000);

describe('stream-closure mutation gate', () => {
	it.each(['vitest.config.js', 'vitest.ci-sharded.config.js'])(
		'has exactly one owner in %s',
		(config) => {
			expect(
				mutationOwners(config, 'packages/octane/tests/mutations/stream-closure.test.ts'),
			).toEqual(['octane-signals-mutations']);
		},
		75_000,
	);
	it('executes all three expanded unmutated controls', () => {
		expect(normal.targetIds).toHaveLength(3);
	});
	it('kills only the three intended assertion failures', async () => {
		const result = await runMutation(row, 'mutant', { expectedIds: normal.targetIds });
		expect(result.status, JSON.stringify(result)).toBe('killed');
	}, 75_000);
	it('reports the no-op transform as a survivor', async () => {
		const result = await runMutation(row, 'noop', { expectedIds: normal.targetIds });
		expect(result.status, JSON.stringify(result)).toBe('survived');
	}, 75_000);

	it.each([
		['stale source', { ...row, find: `${row.find} /* stale */` }, 'source-match'],
		['multiple source matches', { ...row, find: 'iterator' }, 'source-match'],
		['unloaded source', { ...row, file: 'README.md' }, 'transform-count'],
		[
			'missing target',
			{ ...row, tests: [...row.tests.slice(0, 2), 'missing target'] },
			'missing-or-duplicate-target',
		],
	] as const)(
		'rejects a real %s run',
		async (_name, invalidRow, reason) => {
			const result = await runMutation(invalidRow, 'mutant', { expectedIds: normal.targetIds });
			expect(result.status, JSON.stringify(result)).toBe('runner-error');
			expect(result.reason).toBe(reason);
		},
		75_000,
	);

	it.each([
		['non-assertion', "throw new TypeError('mutation negative control');", 'unintended-failure'],
		['import failure', "import './mutation-missing-module';", 'suite-or-global-error'],
	] as const)(
		'rejects a real %s failure',
		async (_name, replacement, reason) => {
			const result = await runMutation(row, 'mutant', {
				expectedIds: normal.targetIds,
				testMutation: {
					find:
						_name === 'non-assertion'
							? "expect(signals.get('a')?.aborted).toBe(true);"
							: 'const owners: Scope[] = [];',
					replace: replacement,
				},
			});
			expect(result.status, JSON.stringify(result)).toBe('runner-error');
			expect(result.reason).toBe(reason);
		},
		75_000,
	);

	it.each(['beforeEach', 'afterEach'])(
		'rejects an assertion thrown by %s rather than by the target',
		async (hook) => {
			const result = await runMutation(row, 'mutant', {
				expectedIds: normal.targetIds,
				testMutation: {
					find: 'const owners: Scope[] = [];',
					replace: `${hook === 'beforeEach' ? "import { beforeEach } from 'vitest';\n" : ''}${hook}(() => { expect(false).toBe(true); });\nconst owners: Scope[] = [];`,
				},
			});
			expect(result.status, JSON.stringify(result)).toBe('runner-error');
			expect(result.reason).toBe('hook-or-retry');
		},
		75_000,
	);

	it('rejects a timed-out child after its target test starts', async () => {
		const result = await runMutation(row, 'mutant', {
			expectedIds: normal.targetIds,
			timeoutAfterTestStarted: 250,
			testMutation: {
				find: "expect(signals.get('a')?.aborted).toBe(true);",
				replace: 'await new Promise(() => {});',
			},
		});
		expect(result.status).toBe('runner-error');
		expect(result.reason).toBe('timeout');
		expect(result.execution.startedTests.length).toBeGreaterThan(0);
		expect(result.execution.cleanupError).toBeUndefined();
	}, 75_000);

	// These exercise report validation, not additional Vitest integrations.
	it.each([
		'empty',
		'stale',
		'malformed',
		'null transform',
		'missing metadata',
		'skipped error',
		'duplicate transform',
		'duplicate ID',
		'skipped',
		'retry',
		'global error',
		'wrong first frame',
	])('rejects a %s report fixture', (control) => {
		const report = structuredClone(normal.report);
		const request = { ...normal.request, phase: 'mutant' };
		const execution = { ...normal.execution, code: 1 };
		report.phase = 'mutant';
		report.reason = 'failed';
		const targets = report.tests.filter((test: { name: string }) => row.tests.includes(test.name));
		for (const target of targets) {
			target.state = 'failed';
			target.errors = [{ name: 'AssertionError', firstFile: target.file }];
		}
		expect(classifyMutation(report, request, execution, normal.targetIds).status).toBe('killed');
		if (control === 'empty') report.tests = [];
		if (control === 'stale') report.nonce = 'stale';
		if (control === 'malformed') report.tests = [null];
		if (control === 'null transform') report.transforms = [null];
		if (control === 'missing metadata') delete targets[0].hookFailed;
		if (control === 'skipped error')
			report.tests.find((test: { state: string }) => test.state === 'skipped').errors = [
				{ name: 'Error' },
			];
		if (control === 'duplicate transform') report.transforms.push(report.transforms[0]);
		if (control === 'duplicate ID') targets[1].id = targets[0].id;
		if (control === 'skipped') targets[0].state = 'skipped';
		if (control === 'retry') targets[0].retryCount = 1;
		if (control === 'global error') report.errors.push({ name: 'Error' });
		if (control === 'wrong first frame') targets[0].errors[0].firstFile = report.transforms[0].file;
		expect(classifyMutation(report, request, execution, normal.targetIds).status).toBe(
			'runner-error',
		);
	});
});
