import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
	ISSUE_MARKER,
	buildPrompt,
	findGrowth,
	mergeIssueBody,
	parseEntries,
	renderEntry,
} from './size-review.mjs';

const bytes = (value) => ({ median: value, min: value, samples: 1 });
const suite = (name, targets) => ({ suite: name, iterations: 1, harnessExit: 0, targets });
const metrics = (raw, gzip, brotli, prefix = '') => ({
	[`${prefix}raw`]: bytes(raw),
	[`${prefix}gzip`]: bytes(gzip),
	[`${prefix}brotli`]: bytes(brotli),
});

const base = {
	'bundle-size': suite('bundle-size', [
		{
			name: 'octane-tsrx',
			ops: { ...metrics(1000, 400, 350, 'todo_app_'), ...metrics(9000, 3000, 2600, 'js_') },
		},
		{ name: 'octane-tsrx-budget', ops: metrics(1, 1, 1, 'js_') },
		{ name: 'react', ops: metrics(50000, 16000, 14000, 'js_') },
	]),
	'bundle-reachability': suite('bundle-reachability', [
		{ name: 'hydrate-root', ops: metrics(20000, 7000, 6200) },
		{ name: 'context', ops: metrics(8000, 3000, 2700) },
	]),
};
const head = {
	'bundle-size': suite('bundle-size', [
		{
			name: 'octane-tsrx',
			ops: { ...metrics(1100, 440, 380, 'todo_app_'), ...metrics(9000, 3000, 2600, 'js_') },
		},
		{ name: 'octane-tsrx-budget', ops: metrics(9, 9, 9, 'js_') },
		{ name: 'react', ops: metrics(60000, 20000, 18000, 'js_') },
	]),
	'bundle-reachability': suite('bundle-reachability', [
		{ name: 'hydrate-root', ops: metrics(20100, 7010, 6190) },
		{ name: 'context', ops: metrics(7900, 2990, 2690) },
		{ name: 'new-scenario', ops: metrics(100, 50, 40) },
	]),
};

test('growth is grouped per Octane bundle with every metric and ordered by gzip growth', () => {
	const growth = findGrowth(base, head, { minGzip: 32 });
	assert.deepEqual(
		growth.grown.map(({ suite, target, bundle, gzip, raw, brotli }) => [
			suite,
			target,
			bundle,
			gzip.delta,
			raw.delta,
			brotli.delta,
		]),
		[
			['bundle-size', 'octane-tsrx', 'todo_app', 40, 100, 30],
			['bundle-reachability', 'hydrate-root', '', 10, 100, -10],
		],
	);
	assert.equal(growth.shrank, 1);
	assert.equal(growth.grew, true);
});

test('growth below the gzip threshold, or on a failed side, is not reviewed', () => {
	assert.equal(findGrowth(base, head, { minGzip: 41 }).grew, false);
	const failed = { ...head, 'bundle-size': { ...head['bundle-size'], failed: 'build broke' } };
	assert.deepEqual(
		findGrowth(base, failed, { minGzip: 1 }).grown.map(({ target }) => target),
		['hydrate-root'],
	);
});

const growth = findGrowth(base, head, { minGzip: 32 });
const commits = [
	{
		sha: 'a'.repeat(40),
		subject: 'feat: add a thing (#12)',
		pr: {
			number: 12,
			title: 'feat: add a thing',
			author: 'someone',
			url: 'https://example.test/12',
		},
	},
];
const entryFor = (sha, analysis = '**Verdict:** earned — needed for the thing.') =>
	renderEntry({ baseSha: 'b'.repeat(40), headSha: sha, commits, growth, analysis });

test('an entry names the pull request, the largest growth, the table, and the review', () => {
	const entry = entryFor('a'.repeat(40));
	assert.match(entry, /^### #12 feat: add a thing$/m);
	assert.match(entry, /\[#12\]\(https:\/\/example\.test\/12\) feat: add a thing \(@someone\)/);
	assert.match(
		entry,
		/\*\*Largest growth:\*\* \+40 gzip bytes in bundle-size `octane-tsrx` \(todo_app\)/,
	);
	assert.match(entry, /\| bundle-size \| octane-tsrx \| todo_app \| 400 → 440 \| \+40 \| \+100 \|/);
	assert.match(entry, /\*\*Verdict:\*\* earned/);
	assert.match(entryFor('a'.repeat(40), ''), /add an `ANTHROPIC_API_KEY` repository secret/);
});

test('the rolling issue keeps one entry per commit, newest first', () => {
	const options = (headSha) => ({ headSha, repository: 'octanejs/octane', minGzip: 32 });
	const first = mergeIssueBody('', entryFor('1'.repeat(40)), options('1'.repeat(40)));
	assert.ok(first.startsWith(ISSUE_MARKER));
	assert.match(first, /at least 32 gzip bytes/);
	const second = mergeIssueBody(first, entryFor('2'.repeat(40)), options('2'.repeat(40)));
	assert.deepEqual(
		parseEntries(second).map(({ sha }) => sha[0]),
		['2', '1'],
	);
	// A rerun for the first commit replaces its entry and moves it to the top.
	const rerun = mergeIssueBody(
		second,
		entryFor('1'.repeat(40), '**Verdict:** slop — rerun.'),
		options('1'.repeat(40)),
	);
	const entries = parseEntries(rerun);
	assert.deepEqual(
		entries.map(({ sha }) => sha[0]),
		['1', '2'],
	);
	assert.match(entries[0].text, /rerun/);
	assert.doesNotMatch(rerun, /needed for the thing[\s\S]*needed for the thing[\s\S]*needed for/);
});

test('the oldest entries are dropped to fit GitHub issue limits', () => {
	let body = '';
	const long = 'x'.repeat(11_000);
	for (let index = 0; index < 8; index++) {
		const sha = String(index).repeat(40);
		body = mergeIssueBody(body, entryFor(sha, long), { headSha: sha, minGzip: 32 });
	}
	assert.ok(body.length <= 60_000);
	const kept = parseEntries(body).map(({ sha }) => sha[0]);
	assert.equal(kept[0], '7');
	assert.ok(kept.length < 8 && kept.length >= 4);
	assert.deepEqual(kept, [...kept].sort().reverse());
});

test('the prompt gives Claude the range, the landed pull requests, and the growth', () => {
	const prompt = buildPrompt({ baseSha: 'b'.repeat(40), headSha: 'a'.repeat(40), commits, growth });
	assert.ok(prompt.includes(`git diff ${'b'.repeat(40)} ${'a'.repeat(40)}`));
	assert.match(prompt, /#12\]\(https:\/\/example\.test\/12\) feat: add a thing/);
	assert.match(prompt, /\| bundle-size \| octane-tsrx \| todo_app \|/);
	assert.match(prompt, /Do not edit any file/);
});

test('the workflow reviews main after the push and keeps Claude read-only', () => {
	const workflow = readFileSync(
		new URL('../.github/workflows/size-review.yml', import.meta.url),
		'utf8',
	);
	assert.match(workflow, /^on:\n  push:\n    branches: \[main\]\n/m);
	assert.doesNotMatch(workflow, /pull_request/);
	assert.match(workflow, /^permissions:\n  contents: read$/m);
	assert.match(workflow, /persist-credentials: false/);
	for (const uses of workflow.match(/uses: \S+/g)) assert.match(uses, /@[0-9a-f]{40}$/, uses);
	const step = (name) => {
		const start = workflow.indexOf(`      - name: ${name}\n`);
		assert.notEqual(start, -1, name);
		const next = workflow.indexOf('\n      - name:', start + 1);
		return workflow.slice(start, next === -1 ? undefined : next);
	};
	const claude = step('Review the growth with Claude');
	assert.match(
		claude,
		/if: steps\.growth\.outputs\.grew == 'true' && env\.HAS_ANTHROPIC_KEY == 'true'/,
	);
	assert.match(
		claude,
		/--allowedTools "Read,Grep,Glob,Bash\(git diff:\*\),Bash\(git log:\*\),Bash\(git show:\*\)"/,
	);
	assert.match(claude, /@anthropic-ai\/claude-code@\d+\.\d+\.\d+ /);
	assert.doesNotMatch(claude, /GH_TOKEN|github\.token/);
	const record = step('Record the review in the size issue');
	assert.match(record, /if: steps\.growth\.outputs\.grew == 'true'\n/);
	assert.doesNotMatch(record, /ANTHROPIC/);
});
