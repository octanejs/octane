import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkBudgetRaises, findBudgetRaises } from './budget-raises.mjs';
import { ratchetBudget, verifyByteBudget } from './minimal-gates.mjs';

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

test('a feature saving bytes must record the lower cap before another change can spend it', () => {
	const saved = { raw: 800, gzip: 350, brotli: 330 };
	const old = { raw: 1032, gzip: 432, brotli: 606 };
	// All bytes fit the old ceiling, but a later 200-byte regression would fit it too.
	assert.throws(
		() => verifyByteBudget('hydrate-root', saved, old, true, true),
		/hydrate-root.*ratchet.*832/,
	);
	const lowered = ratchetBudget(saved, old);
	verifyByteBudget('hydrate-root', saved, lowered, true, true);
	assert.throws(
		() => verifyByteBudget('hydrate-root', { ...saved, raw: 1000 }, lowered, true, true),
		/exceed committed budget/,
	);
});

test('the Git base exempts only budget-only raises and keeps their absolute ceiling', (t) => {
	const repository = mkdtempSync(path.join(tmpdir(), 'octane-budget-ratchet-'));
	t.after(() => rmSync(repository, { recursive: true, force: true }));
	const git = (...args) =>
		execFileSync('git', args, {
			cwd: repository,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	const commit = (message) => {
		git('add', '.');
		// This is a disposable test repository, not the developer's checkout.
		git(
			'-c',
			'user.name=Bundle budget test',
			'-c',
			'user.email=budget-test@example.invalid',
			'-c',
			'commit.gpgsign=false',
			'commit',
			'-m',
			message,
		);
		return git('rev-parse', 'HEAD');
	};
	const budgetDirectory = path.join(repository, 'benchmarks/bundle-size');
	mkdirSync(budgetDirectory, { recursive: true });
	for (const name of ['budget-raises.mjs', 'minimal-gates.mjs']) {
		cpSync(path.join(import.meta.dirname, name), path.join(budgetDirectory, name));
	}
	const writeBudget = (value) =>
		writeFileSync(path.join(repository, MINIMAL), JSON.stringify({ scenario: value }));
	writeFileSync(
		path.join(repository, 'run-gate.mjs'),
		`import { readFileSync } from 'node:fs';
import { requireBudgetRatchet } from './benchmarks/bundle-size/budget-raises.mjs';
import { verifyByteBudget } from './benchmarks/bundle-size/minimal-gates.mjs';
const budget = JSON.parse(readFileSync('benchmarks/bundle-size/minimal-budgets.json')).scenario;
verifyByteBudget('scenario', JSON.parse(process.argv[2]), budget, true,
  requireBudgetRatchet(['--budgets', '--ratchet']));
`,
	);
	const gate = (base, measured) =>
		spawnSync(process.execPath, ['run-gate.mjs', JSON.stringify(measured)], {
			cwd: repository,
			encoding: 'utf8',
			env: { ...process.env, BUDGET_BASE: base },
		});
	const lint = (base) =>
		spawnSync(process.execPath, ['benchmarks/bundle-size/budget-raises.mjs', '--base', base], {
			cwd: repository,
			encoding: 'utf8',
		});
	git('init', '-b', 'main');
	const measured = { raw: 1000, gzip: 400, brotli: 350 };
	writeBudget({ raw: 1032, gzip: 432, brotli: 606 });
	const originalBase = commit('baseline');
	const after = { raw: 1232, gzip: 520, brotli: 685 };
	writeBudget(after);
	writeFileSync(path.join(repository, 'CONTRIBUTING.md'), 'Reason for this budget increase.\n');
	const raisedBase = commit('review budget increase');

	const allowed = gate(originalBase, measured);
	assert.equal(allowed.status, 0, allowed.stderr);
	const raiseLint = lint(originalBase);
	assert.equal(raiseLint.status, 0, raiseLint.stderr);
	assert.match(raiseLint.stdout, /budget-only change/);
	const breach = gate(originalBase, { ...measured, raw: after.raw + 1 });
	assert.notEqual(breach.status, 0);
	assert.match(breach.stderr, /exceed committed budget/);

	mkdirSync(path.join(repository, 'packages/octane/src'), { recursive: true });
	writeFileSync(
		path.join(repository, 'packages/octane/src/runtime.ts'),
		'export const added = 1;\n',
	);
	commit('add feature');
	const mixed = gate(originalBase, measured);
	assert.notEqual(mixed.status, 0);
	assert.match(mixed.stderr, /ratchet/);
	const mixedLint = lint(originalBase);
	assert.notEqual(mixedLint.status, 0);
	assert.match(mixedLint.stderr, /raises 3 committed byte budget\(s\)/);
	assert.match(mixedLint.stderr, /packages\/octane\/src\/runtime\.ts/);

	// After the budget-only change has landed, the feature returns unused slack.
	const feature = { raw: 1200, gzip: 450, brotli: 400 };
	const unused = gate(raisedBase, feature);
	assert.notEqual(unused.status, 0);
	assert.match(unused.stderr, /ratchet/);
	writeBudget(ratchetBudget(feature, after));
	commit('record lower caps');
	const tight = gate(raisedBase, feature);
	assert.equal(tight.status, 0, tight.stderr);
	const featureLint = lint(raisedBase);
	assert.equal(featureLint.status, 0, featureLint.stderr);
	assert.match(featureLint.stdout, /no committed byte budget was raised/);
});

test('a tight cap remains valid when brotli grew while raw and gzip shrank', () => {
	const budget = { raw: 932, gzip: 412, brotli: 606 };
	verifyByteBudget('scenario', { raw: 900, gzip: 380, brotli: 590 }, budget, true, true);
});
