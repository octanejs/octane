import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
	ISSUE_MARKER,
	buildPrompt,
	entrySha,
	findGrowth,
	issueBody,
	publishEntry,
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

test('the rolling issue body explains its entries, which are comments', () => {
	const body = issueBody('octanejs/octane', 32);
	assert.ok(body.startsWith(ISSUE_MARKER));
	assert.match(body, /at least 32 gzip bytes/);
	assert.equal(entrySha(entryFor('1'.repeat(40))), '1'.repeat(40));
	assert.equal(entrySha('Folded into #1.'), null);
	assert.equal(entrySha(body), null);
});

// An in-memory issue tracker. Each hook runs once, inside the next call of its
// name, to replay another publish landing between this one's read and write.
function fakeIssues() {
	const issues = new Map();
	let nextIssue = 1;
	let nextComment = 1;
	const hooks = { beforeCreate: null, beforeComment: null };
	const runHook = (name) => {
		const hook = hooks[name];
		hooks[name] = null;
		hook?.();
	};
	const github = {
		openIssues: () => [...issues].filter(([, issue]) => issue.open).map(([number]) => number),
		comments: (number) => issues.get(number).comments.map((comment) => ({ ...comment })),
		create(body) {
			runHook('beforeCreate');
			const number = nextIssue++;
			issues.set(number, { body, open: true, comments: [] });
			return number;
		},
		comment(number, body) {
			runHook('beforeComment');
			issues.get(number).comments.push({ id: nextComment++, body });
		},
		editComment(id, body) {
			for (const issue of issues.values()) {
				for (const comment of issue.comments) if (comment.id === id) comment.body = body;
			}
		},
		close(number, comment) {
			issues.get(number).open = false;
			issues.get(number).comments.push({ id: nextComment++, body: comment });
		},
	};
	const entries = (number) =>
		issues
			.get(number)
			.comments.map(({ body }) => entrySha(body)?.[0])
			.filter(Boolean);
	const publishAs = (sha, analysis) =>
		publishEntry(github, {
			entry: entryFor(sha, analysis),
			headSha: sha,
			repository: 'octanejs/octane',
			minGzip: 32,
		});
	return { github, issues, hooks, entries, publishAs };
}

test('each push adds one entry comment, and a rerun edits its own', () => {
	const { issues, entries, publishAs } = fakeIssues();
	assert.equal(publishAs('1'.repeat(40)), 1);
	assert.match(issues.get(1).body, /at least 32 gzip bytes/);
	assert.equal(publishAs('2'.repeat(40)), 1);
	assert.equal(publishAs('1'.repeat(40), '**Verdict:** slop — rerun.'), 1);
	assert.deepEqual(entries(1), ['1', '2']);
	assert.match(issues.get(1).comments[0].body, /rerun/);
	assert.equal(issues.size, 1);
});

test('concurrent publishes to the open issue keep both entries', () => {
	const { hooks, entries, publishAs } = fakeIssues();
	assert.equal(publishAs('a'.repeat(40)), 1);
	// Both read the open issue; the second push publishes start to finish
	// before the first writes its entry.
	hooks.beforeComment = () => assert.equal(publishAs('c'.repeat(40)), 1);
	assert.equal(publishAs('d'.repeat(40)), 1);
	assert.deepEqual(entries(1), ['a', 'c', 'd']);
});

test('two publishes that each open an issue converge on the oldest one', () => {
	const { github, issues, hooks, entries, publishAs } = fakeIssues();
	// Both find no open issue: the second push publishes start to finish while
	// the first is about to open its own.
	hooks.beforeCreate = () => assert.equal(publishAs('c'.repeat(40)), 1);
	assert.equal(publishAs('a'.repeat(40)), 1);
	assert.deepEqual(github.openIssues(), [1]);
	assert.deepEqual(entries(1), ['c', 'a']);
	assert.equal(issues.get(2).open, false);
	// A later push keeps writing to the surviving issue.
	assert.equal(publishAs('d'.repeat(40)), 1);
	assert.deepEqual(entries(1), ['c', 'a', 'd']);
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
	// A failed or timed-out review still lets the growth be recorded, and only
	// a finished review becomes analysis.md.
	assert.match(claude, /continue-on-error: true/);
	assert.doesNotMatch(claude, />\s*"\$RESULTS\/review\/analysis\.md"/);
	assert.match(
		claude,
		/\n\s+mv "\$RESULTS\/review\/analysis\.partial\.md" "\$RESULTS\/review\/analysis\.md"\n/,
	);
	const record = step('Record the review in the size issue');
	assert.match(record, /if: steps\.growth\.outputs\.grew == 'true'\n/);
	assert.doesNotMatch(record, /ANTHROPIC/);
});
