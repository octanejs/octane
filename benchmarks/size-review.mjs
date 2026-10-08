// Post-merge size review. After a push to main, .github/workflows/size-review.yml
// measures the bundle suites on the commit before the push and on the pushed
// commit, on one runner. This script turns those results into a review:
//
//   node benchmarks/size-review.mjs growth --base=<dir> --head=<dir> --out=<dir>
//   node benchmarks/size-review.mjs prompt --out=<dir>
//   node benchmarks/size-review.mjs publish --out=<dir>
//
// `growth` compares the two result directories and writes growth.json, and
// `grew=true` to GITHUB_OUTPUT when some bundle grew by at least
// SIZE_REVIEW_MIN_GZIP_BYTES gzip bytes. `prompt` writes the instructions
// Claude reviews the landed diff with. `publish` records the growth and
// Claude's review (analysis.md, when present) in one rolling issue: an open
// issue is edited in place, newest entry first, and a new issue is opened only
// when none is open. Nothing here gates a merge; it reports what landed.
//
// BASE_SHA, HEAD_SHA, GITHUB_REPOSITORY, and RUN_URL describe the range; `gh`
// with GH_TOKEN reads pull requests and writes the issue.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareSuite } from './pr-report.mjs';

export const SIZE_SUITES = ['bundle-size', 'bundle-reachability'];
export const ISSUE_TITLE = 'Bundle size review';
export const ISSUE_MARKER = '<!-- octane-size-review -->';
export const DEFAULT_MIN_GZIP_BYTES = 32;
const ENTRY_END = '<!-- size-review:end -->';
const entryStart = (sha) => `<!-- size-review:entry ${sha} -->`;
const ENTRY_START = /<!-- size-review:entry ([0-9a-f]+) -->/g;
// GitHub rejects issue bodies over 65,536 characters.
const BODY_LIMIT = 60_000;
const ANALYSIS_LIMIT = 12_000;
const TABLE_ROWS = 20;
const METRIC = /^(?:(.*)_)?(raw|gzip|brotli)$/;

// One row per measured bundle that changed: its gzip, raw, and brotli bytes on
// both sides. A bundle's name is the operation without its metric suffix, so
// `todo_app_gzip` is the TodoMVC application chunk and a reachability
// scenario's bare `gzip` is the whole scenario.
export function findGrowth(base, head, { minGzip = DEFAULT_MIN_GZIP_BYTES } = {}) {
	const bundles = new Map();
	for (const suite of SIZE_SUITES) {
		if (!base?.[suite] || !head?.[suite] || base[suite].failed || head[suite].failed) continue;
		const { deterministic } = compareSuite(suite, base[suite], head[suite]);
		for (const row of deterministic) {
			const match = METRIC.exec(row.op);
			if (!match || row.before == null || row.target.endsWith('-budget')) continue;
			const bundle = match[1] ?? '';
			const key = `${suite}\0${row.target}\0${bundle}`;
			let entry = bundles.get(key);
			if (entry === undefined) {
				entry = { suite, target: row.target, bundle };
				bundles.set(key, entry);
			}
			entry[match[2]] = { before: row.before, after: row.after, delta: row.after - row.before };
		}
	}
	const rows = [...bundles.values()]
		.filter((row) => row.gzip)
		.sort((a, b) => b.gzip.delta - a.gzip.delta || a.target.localeCompare(b.target));
	const grown = rows.filter((row) => row.gzip.delta > 0);
	return {
		minGzip,
		grew: grown.some((row) => row.gzip.delta >= minGzip),
		grown,
		shrank: rows.filter((row) => row.gzip.delta < 0).length,
	};
}

const formatInteger = (value) => Math.round(value).toLocaleString('en-US');
const formatDelta = (value) =>
	value == null ? '–' : (value > 0 ? '+' : value < 0 ? '−' : '±') + formatInteger(Math.abs(value));

export function renderGrowthTable({ grown }, limit = TABLE_ROWS) {
	const line = (row) =>
		`| ${row.suite} | ${row.target} | ${row.bundle || '–'} | ${formatInteger(row.gzip.before)} → ` +
		`${formatInteger(row.gzip.after)} | ${formatDelta(row.gzip.delta)} | ${formatDelta(row.raw?.delta)} |`;
	const header = [
		'| suite | target | bundle | gzip bytes | Δ gzip | Δ raw |',
		'| --- | --- | --- | ---: | ---: | ---: |',
	];
	const shown = grown.slice(0, limit);
	const rest = grown.slice(limit);
	return [
		...header,
		...shown.map(line),
		...(rest.length
			? [
					'',
					'<details>',
					`<summary>${rest.length} more grown bundle(s)</summary>`,
					'',
					...header,
					...rest.map(line),
					'',
					'</details>',
				]
			: []),
	].join('\n');
}

const shortSha = (sha) => sha.slice(0, 10);
const describeCommit = ({ sha, subject, pr }) =>
	pr
		? `- ${shortSha(sha)} [#${pr.number}](${pr.url}) ${pr.title} (@${pr.author})`
		: `- ${shortSha(sha)} ${subject}`;

export function buildPrompt({ baseSha, headSha, commits, growth }) {
	return `You are reviewing a change that just landed on main in the Octane repository, a React-shaped UI framework compiled ahead of time from .tsrx. CLAUDE.md orients you, and packages/octane/src/runtime.ts carries the runtime's design notes.

The landed range is ${baseSha}..${headSha}:
${commits.map(describeCommit).join('\n')}

It grew these production bundles, measured by deterministic builds of the same scenarios on both commits on one runner:

${renderGrowthTable(growth, 30)}

What the rows are:
- \`bundle-reachability\` targets are minimal public-import entries built and executed by benchmarks/bundle-size/run-minimal.mjs (fixtures in benchmarks/bundle-size/fixtures/minimal).
- \`bundle-size\` targets are complete applications built by benchmarks/bundle-size/run.mjs. In the bundle column, \`app\` is authored and compiled application code, \`fw\` is the runtime it reaches, \`js\` is both, \`full_fw\` is every export of the framework entry points, and a \`todo_\`, \`chat_\`, \`weather_\`, or \`bindings_\` prefix names the application.

Do this:
1. Read the landed diff with \`git diff ${baseSha} ${headSha}\`, narrowing it by path. Focus on code that ships to clients: packages/octane/src (runtime and compiler output) and binding sources.
2. Attribute the growth to specific hunks.
3. Judge each hunk. It is earned when a feature or fix needs it; name what. It is slop when it is duplicated logic, a dead or unreachable branch, a development-only diagnostic or string reaching production, a defensive check for an impossible state, verbose code that minifies poorly, a new helper where an existing one fits, or code the measured scenarios never use that cannot be tree-shaken.
4. For each item that could be smaller, give a concrete rewrite: the file and line, what to change, and roughly how many bytes it saves.

Do not edit any file. Reply with only GitHub Markdown, no preamble, under about 600 words:
- First line: **Verdict:** earned, partly slop, or slop, then one sentence.
- \`#### Where the bytes went\`: the hunks responsible, with file:line references.
- \`#### Could be smaller\`: a numbered list of concrete rewrites. If everything is earned, say so in one line.
`;
}

export function renderEntry({ baseSha, headSha, commits, growth, analysis, runUrl }) {
	const largest = growth.grown[0];
	const heading = commits.find((commit) => commit.pr)?.pr;
	const review = analysis?.trim()
		? analysis.trim().slice(0, ANALYSIS_LIMIT)
		: '_No Claude review: add an `ANTHROPIC_API_KEY` repository secret to enable it, or check the workflow run._';
	return [
		entryStart(headSha),
		`### ${heading ? `#${heading.number} ${heading.title}` : shortSha(headSha)}`,
		'',
		commits.map(describeCommit).join('\n'),
		'',
		`**Largest growth:** ${formatDelta(largest.gzip.delta)} gzip bytes in ${largest.suite} ` +
			`\`${largest.target}\`${largest.bundle ? ` (${largest.bundle})` : ''}. ` +
			`${growth.grown.length} bundle(s) grew and ${growth.shrank} shrank between ` +
			`\`${shortSha(baseSha)}\` and \`${shortSha(headSha)}\`.`,
		'',
		renderGrowthTable(growth),
		'',
		'#### Review',
		'',
		review,
		'',
		runUrl ? `<sub>[Workflow run](${runUrl})</sub>` : '',
		ENTRY_END,
	]
		.filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
		.join('\n');
}

function header(repository, minGzip) {
	const workflow = repository
		? `[size-review.yml](https://github.com/${repository}/blob/main/.github/workflows/size-review.yml)`
		: '`size-review.yml`';
	return [
		ISSUE_MARKER,
		'## Bundle size review',
		'',
		`Each entry is a change that landed on \`main\` and grew a production bundle by at least ${minGzip} gzip bytes, ` +
			'measured by deterministic builds of the bundle-size and reachability scenarios before and after the push. ' +
			'Claude reviewed each landed diff for where the bytes went, whether the growth is earned or slop, and how the ' +
			'change could have been written smaller.',
		'',
		`${workflow} adds new entries to the top while this issue is open. Close it once the entries are triaged; ` +
			'the next growth opens a new one.',
		'',
	].join('\n');
}

export function parseEntries(body) {
	const entries = [];
	const starts = [...(body ?? '').matchAll(ENTRY_START)];
	for (const [index, match] of starts.entries()) {
		const end = index + 1 < starts.length ? starts[index + 1].index : body.length;
		const text = body.slice(match.index, end).trimEnd();
		entries.push({ sha: match[1], text });
	}
	return entries;
}

// Puts the entry at the top, replacing an earlier entry for the same commit (a
// rerun), and drops the oldest entries until the body fits GitHub's limit.
export function mergeIssueBody(body, entry, { headSha, repository, minGzip }) {
	const entries = [
		{ sha: headSha, text: entry },
		...parseEntries(body).filter((existing) => existing.sha !== headSha),
	];
	const top = header(repository, minGzip);
	const render = () => top + '\n' + entries.map((existing) => existing.text).join('\n\n') + '\n';
	let next = render();
	while (next.length > BODY_LIMIT && entries.length > 1) {
		entries.pop();
		next = render();
	}
	return next;
}

function readSuites(directory) {
	return Object.fromEntries(
		SIZE_SUITES.map((suite) => {
			const file = path.join(directory, `${suite}.json`);
			return [suite, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null];
		}),
	);
}

const run = (command, args, options = {}) =>
	execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });

function landedCommits(baseSha, headSha, repository) {
	const shas = run('git', [
		'rev-list',
		'--first-parent',
		'--max-count=20',
		`${baseSha}..${headSha}`,
	])
		.split('\n')
		.filter(Boolean);
	return shas.map((sha) => {
		const subject = run('git', ['log', '-1', '--format=%s', sha]).trim();
		let pr = null;
		try {
			const pulls = JSON.parse(run('gh', ['api', `repos/${repository}/commits/${sha}/pulls`]));
			const merged = pulls.find((pull) => pull.merged_at) ?? pulls[0];
			if (merged) {
				pr = {
					number: merged.number,
					title: merged.title,
					author: merged.user.login,
					url: merged.html_url,
				};
			}
		} catch {
			// A commit pushed straight to main has no pull request.
		}
		return { sha, subject, pr };
	});
}

function openIssue(repository) {
	const issues = JSON.parse(
		run('gh', [
			'api',
			'--paginate',
			'--slurp',
			`repos/${repository}/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100`,
		]),
	).flat();
	return (
		issues
			.filter((issue) => !issue.pull_request && issue.body?.includes(ISSUE_MARKER))
			.sort((a, b) => a.number - b.number)[0] ?? null
	);
}

function publish(directory) {
	const repository = process.env.GITHUB_REPOSITORY;
	const growth = JSON.parse(fs.readFileSync(path.join(directory, 'growth.json'), 'utf8'));
	const { baseSha, headSha, commits } = JSON.parse(
		fs.readFileSync(path.join(directory, 'range.json'), 'utf8'),
	);
	const analysisFile = path.join(directory, 'analysis.md');
	const analysis = fs.existsSync(analysisFile) ? fs.readFileSync(analysisFile, 'utf8') : '';
	const entry = renderEntry({
		baseSha,
		headSha,
		commits,
		growth,
		analysis,
		runUrl: process.env.RUN_URL,
	});
	const bodyFile = path.join(directory, 'issue-body.md');
	const options = { headSha, repository, minGzip: growth.minGzip };
	// Two pushes can publish at once; re-read and retry until this entry survives.
	for (let attempt = 1; attempt <= 3; attempt++) {
		const issue = openIssue(repository);
		fs.writeFileSync(bodyFile, mergeIssueBody(issue?.body ?? '', entry, options));
		let number = issue?.number;
		if (number == null) {
			const url = run('gh', [
				'issue',
				'create',
				'-R',
				repository,
				'--title',
				ISSUE_TITLE,
				'--body-file',
				bodyFile,
			]).trim();
			number = Number(url.split('/').pop());
		} else {
			run('gh', ['issue', 'edit', String(number), '-R', repository, '--body-file', bodyFile]);
		}
		const body = run('gh', ['api', `repos/${repository}/issues/${number}`, '--jq', '.body']);
		if (body.includes(entryStart(headSha))) {
			console.log(`size review recorded in ${repository}#${number}`);
			return;
		}
		console.warn(`size review entry was overwritten on attempt ${attempt}; retrying`);
	}
	throw new Error('could not record the size review entry');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [command, ...rest] = process.argv.slice(2);
	const options = Object.fromEntries(
		rest
			.filter((arg) => arg.startsWith('--') && arg.includes('='))
			.map((arg) => [arg.slice(2, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]),
	);
	const directory = options.out;
	if (!directory || !['growth', 'prompt', 'publish'].includes(command)) {
		console.error('usage: node benchmarks/size-review.mjs growth|prompt|publish --out=<dir>');
		process.exit(2);
	}
	fs.mkdirSync(directory, { recursive: true });
	if (command === 'growth') {
		const minGzip = Number(process.env.SIZE_REVIEW_MIN_GZIP_BYTES) || DEFAULT_MIN_GZIP_BYTES;
		const base = readSuites(options.base);
		const head = readSuites(options.head);
		for (const suite of SIZE_SUITES) {
			if (!head[suite] || head[suite].failed) console.warn(`${suite} has no head result`);
			if (!base[suite] || base[suite].failed) console.warn(`${suite} has no base result`);
		}
		const growth = findGrowth(base, head, { minGzip });
		fs.writeFileSync(path.join(directory, 'growth.json'), JSON.stringify(growth, null, '\t'));
		console.log(
			growth.grown.length ? renderGrowthTable(growth) : 'No bundle grew.',
			`\n\n${growth.grew ? 'Growth' : 'No growth'} at or above ${minGzip} gzip bytes.`,
		);
		if (process.env.GITHUB_OUTPUT) {
			fs.appendFileSync(process.env.GITHUB_OUTPUT, `grew=${growth.grew}\n`);
		}
	} else if (command === 'prompt') {
		const baseSha = process.env.BASE_SHA;
		const headSha = process.env.HEAD_SHA;
		const commits = landedCommits(baseSha, headSha, process.env.GITHUB_REPOSITORY);
		const growth = JSON.parse(fs.readFileSync(path.join(directory, 'growth.json'), 'utf8'));
		fs.writeFileSync(
			path.join(directory, 'range.json'),
			JSON.stringify({ baseSha, headSha, commits }, null, '\t'),
		);
		fs.writeFileSync(
			path.join(directory, 'prompt.md'),
			buildPrompt({ baseSha, headSha, commits, growth }),
		);
	} else {
		publish(directory);
	}
}
