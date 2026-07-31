import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(REPO, '.github/workflows/ci.yml'), 'utf8');
const publishWorkflow = readFileSync(path.join(REPO, '.github/workflows/publish.yml'), 'utf8');
const draftWorkflow = readFileSync(
	path.join(REPO, '.github/workflows/draft-agent-prs.yml'),
	'utf8',
);
const labelWorkflow = readFileSync(path.join(REPO, '.github/workflows/label-pr.yml'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function jobSource(job) {
	const marker = `  ${job}:\n`;
	const start = workflow.indexOf(marker);
	assert.notEqual(start, -1, `missing ${job} job`);

	const bodyStart = start + marker.length;
	const nextJob = workflow.slice(bodyStart).search(/\n  [a-zA-Z][a-zA-Z0-9_]*:\n/);
	return workflow.slice(start, nextJob === -1 ? undefined : bodyStart + nextJob);
}

function workflowJobs() {
	const jobsMarker = '\njobs:\n';
	const jobsStart = workflow.indexOf(jobsMarker);
	assert.notEqual(jobsStart, -1, 'missing jobs block');

	return [
		...workflow.slice(jobsStart + jobsMarker.length).matchAll(/^  ([a-zA-Z][a-zA-Z0-9_]*):$/gm),
	].map((match) => match[1]);
}

function stepScript(workflowSource, stepName) {
	const stepMarker = `      - name: ${stepName}\n`;
	const stepStart = workflowSource.indexOf(stepMarker);
	assert.notEqual(stepStart, -1, `missing ${stepName} step`);

	const scriptMarker = '          script: |\n';
	const scriptStart = workflowSource.indexOf(scriptMarker, stepStart);
	assert.notEqual(scriptStart, -1, `missing script for ${stepName}`);

	const bodyStart = scriptStart + scriptMarker.length;
	const nextStep = workflowSource.slice(bodyStart).search(/\n      - name:/);
	const body = workflowSource.slice(bodyStart, nextStep === -1 ? undefined : bodyStart + nextStep);
	return body
		.split('\n')
		.map((line) => (line.startsWith('            ') ? line.slice(12) : line))
		.join('\n');
}

describe('CI workflow aggregation', () => {
	test('runs only required-check reporters for draft pull requests', () => {
		assert.match(
			workflow,
			/^  pull_request:\n    branches: \[main\]\n    types: \[opened, reopened, synchronize, ready_for_review, converted_to_draft\]$/m,
		);

		const draftGuard =
			/github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false/;
		const jobs = workflowJobs();
		assert.ok(jobs.length > 0, 'expected CI workflow jobs');
		for (const job of jobs) {
			if (job === 'lint' || job === 'typecheck') continue;
			assert.match(jobSource(job), draftGuard, `${job} must not run on a draft pull request`);
		}

		for (const [reporter, checks] of [
			['lint', 'lint_checks'],
			['typecheck', 'typecheck_checks'],
		]) {
			const source = jobSource(reporter);
			assert.match(source, new RegExp(`needs: \\[release_change, ${checks}\\]`));
			assert.match(source, /if:.*always\(\).*!\s*cancelled\(\)/);
			assert.match(source, /IS_DRAFT:.*pull_request\.draft == true/);
			assert.doesNotMatch(source, /actions\/checkout|pnpm install|pnpm typecheck/);
		}
	});

	test('does not turn a superseded run into failed aggregate checks', () => {
		for (const job of ['test', 'examples', 'lint', 'typecheck', 'provenance']) {
			assert.match(jobSource(job), /if:.*always\(\).*!\s*cancelled\(\)/);
		}
	});

	test('skips expensive jobs only after the committed scope classifier opts out', () => {
		assert.match(
			jobSource('release_change'),
			/full_ci: \$\{\{ steps\.verify_scope\.outputs\.full_ci \}\}/,
		);
		assert.match(jobSource('release_change'), /Verify full-suite provenance/);
		assert.match(jobSource('release_change'), /successfulJobs\.has\("CI provenance"\)/);

		for (const job of [
			'test_shard',
			'website_e2e',
			'heavy_integration',
			'typecheck_checks',
			'example_shard',
			'three_compat',
			'lynx_compat',
			'package',
		]) {
			assert.match(
				jobSource(job),
				/if:.*needs\.release_change\.outputs\.full_ci != 'false'/,
				`${job} must fail open to full CI`,
			);
		}

		assert.doesNotMatch(jobSource('lint_checks'), /outputs\.full_ci/);
		assert.match(jobSource('lint_checks'), /run: pnpm ci:workflow:test/);
		assert.match(jobSource('lint'), /LINT_CHECKS_RESULT/);
		assert.match(jobSource('typecheck'), /TYPECHECK_CHECKS_RESULT/);
		assert.match(jobSource('test'), /\[ "\$FULL_CI" = false \]/);
		assert.match(jobSource('examples'), /\[ "\$FULL_CI" = false \]/);
		assert.match(jobSource('provenance'), /\[ "\$FULL_CI" = false \]/);
	});
});

describe('Publish workflow validation', () => {
	test('accepts a successful lightweight run through reusable CI provenance', async () => {
		const outputs = new Map();
		const run = {
			event: 'push',
			head_branch: 'main',
			head_repository: { full_name: 'octanejs/octane' },
			head_sha: 'a'.repeat(40),
			path: '.github/workflows/ci.yml',
			conclusion: 'success',
		};
		const github = {
			rest: {
				actions: {
					getWorkflowRun: async () => ({ data: run }),
					listJobsForWorkflowRun: async () => undefined,
				},
			},
			paginate: async () => [{ name: 'CI provenance', conclusion: 'success' }],
		};
		const core = {
			setOutput(name, value) {
				outputs.set(name, value);
			},
			info() {},
		};
		const execute = new AsyncFunction(
			'github',
			'context',
			'core',
			'process',
			stepScript(publishWorkflow, 'Resolve validated SHA'),
		);

		await execute(github, { repo: { owner: 'octanejs', repo: 'octane' } }, core, {
			env: { CI_RUN_ID: '123' },
		});

		assert.equal(outputs.get('sha'), run.head_sha);
		assert.match(publishWorkflow, /successfulJobs\.has\("CI provenance"\)/);
		assert.match(publishWorkflow, /legacyRequiredJobs/);
	});
});

describe('Agent pull request draft policy', () => {
	function runConversion({ pull, timeline = [] }) {
		const converted = [];
		const notices = [];
		const failures = [];
		const github = {
			rest: {
				pulls: { get: async () => ({ data: pull }) },
				issues: { listEventsForTimeline: async () => undefined },
			},
			paginate: async () => timeline,
			graphql: async (_query, variables) => {
				converted.push(variables.id);
				return {};
			},
		};
		const execute = new AsyncFunction(
			'github',
			'context',
			'core',
			stepScript(draftWorkflow, 'Convert an agent-authored pull request back to draft'),
		);

		return execute(
			github,
			{
				repo: { owner: 'octanejs', repo: 'octane' },
				payload: { pull_request: { number: pull.number } },
			},
			{
				notice: (message) => notices.push(message),
				setFailed: (message) => failures.push(message),
			},
		).then(() => ({ converted, notices, failures }));
	}

	const agentPull = {
		number: 423,
		node_id: 'PR_node',
		draft: false,
		state: 'open',
		labels: [{ name: 'feat' }, { name: 'agent-authored' }],
	};

	test('drafts an agent-authored pull request that was opened for review', async () => {
		const { converted, failures } = await runConversion({ pull: agentPull });

		assert.deepEqual(converted, ['PR_node']);
		assert.deepEqual(failures, []);
	});

	test('leaves a pull request alone once it has been marked ready for review', async () => {
		const { converted, notices } = await runConversion({
			pull: agentPull,
			timeline: [{ event: 'labeled' }, { event: 'ready_for_review' }],
		});

		assert.deepEqual(converted, []);
		assert.match(notices.join('\n'), /already marked ready for review/);
	});

	test('ignores a pull request that is already a draft or carries no agent label', async () => {
		const alreadyDraft = await runConversion({ pull: { ...agentPull, draft: true } });
		const humanAuthored = await runConversion({
			pull: { ...agentPull, labels: [{ name: 'feat' }] },
		});

		assert.deepEqual(alreadyDraft.converted, []);
		assert.deepEqual(humanAuthored.converted, []);
	});

	test('runs with a writable token without checking out pull request code', () => {
		assert.match(draftWorkflow, /on:\n {2}pull_request_target:\n {4}types: \[opened, labeled\]/);
		assert.match(draftWorkflow, /^ {6}pull-requests: write$/m);
		assert.match(draftWorkflow, /^ {6}issues: read$/m);
		assert.match(draftWorkflow, /contains\(github\.event\.pull_request\.labels\.\*\.name/);
		assert.doesNotMatch(draftWorkflow, /actions\/checkout/);
		// Converting to draft changes no repository content, and the fallback
		// secret is the answer to a token that cannot run the mutation.
		assert.doesNotMatch(draftWorkflow, /contents: write/);
		assert.match(
			draftWorkflow,
			/github-token: \$\{\{ secrets\.DRAFT_PR_TOKEN \|\| secrets\.GITHUB_TOKEN \}\}/,
		);
	});
});

describe('Pull request labels', () => {
	const TICKED = '- [x] An agent produced this diff (`agent-authored`)';
	const EMPTY = '- [ ] An agent produced this diff (`agent-authored`)';

	function runLabeller({
		title = 'chore: a thing',
		body = `## Provenance\n\n${EMPTY}\n`,
		labels = [],
		state = 'open',
		user = { type: 'User' },
		runDraftPolicy = false,
		timeline = [],
	}) {
		const added = [];
		const removed = [];
		const converted = [];
		const notices = [];
		const failures = [];
		const pull = {
			number: 500,
			node_id: 'PR_node',
			draft: false,
			state,
			title,
			body,
			user,
			labels: labels.map((name) => ({ name })),
		};
		const github = {
			rest: {
				pulls: {
					get: async () => ({ data: pull }),
				},
				issues: {
					addLabels: async ({ labels: names }) => {
						added.push(...names);
						pull.labels.push(...names.map((name) => ({ name })));
					},
					removeLabel: async ({ name }) => {
						removed.push(name);
						pull.labels = pull.labels.filter((label) => label.name !== name);
					},
					listEventsForTimeline: async () => undefined,
				},
			},
			paginate: async () => timeline,
			graphql: async (_query, variables) => {
				converted.push(variables.id);
				return {};
			},
		};
		const executeLabeller = new AsyncFunction(
			'github',
			'context',
			'core',
			stepScript(labelWorkflow, 'Apply the labels the pull request declares'),
		);
		const context = {
			repo: { owner: 'octanejs', repo: 'octane' },
			payload: { pull_request: { number: 500 } },
		};
		const core = {
			notice: (message) => notices.push(message),
			setFailed: (message) => failures.push(message),
		};

		return executeLabeller(github, context, core)
			.then(() => {
				if (!runDraftPolicy) return;
				const executeDraftPolicy = new AsyncFunction(
					'github',
					'context',
					'core',
					stepScript(labelWorkflow, 'Convert an agent-authored pull request back to draft'),
				);
				return executeDraftPolicy(github, context, core);
			})
			.then(() => ({ added, removed, converted, notices, failures }));
	}

	test('reads the type off a conventional-commit title', async () => {
		for (const [title, type] of [
			['feat(lynx): add a thing', 'feat'],
			['fix: repair a thing', 'fix'],
			['perf!: drop a slow path', 'perf'],
			['ci(workflows): only run when needed', 'ci'],
		]) {
			const { added, removed, failures } = await runLabeller({ title });

			assert.deepEqual(added, [type], title);
			assert.deepEqual(removed, []);
			assert.deepEqual(failures, []);
		}
	});

	test('moves the type label when a pull request is retitled', async () => {
		const { added, removed } = await runLabeller({
			title: 'fix(compiler): render the non-JSX arm',
			labels: ['feat', 'blocked'],
		});

		assert.deepEqual(added, ['fix']);
		// Only the superseded type goes. Everything else on the pull request is
		// somebody's deliberate act.
		assert.deepEqual(removed, ['feat']);
	});

	test('leaves the type alone when the title names no type', async () => {
		const { added, removed, notices } = await runLabeller({ title: 'Format' });

		assert.deepEqual(added, []);
		assert.deepEqual(removed, []);
		assert.match(notices.join('\n'), /no conventional-commit type/);
	});

	test('removes a stale type when the pull request title becomes invalid', async () => {
		const { added, removed, notices } = await runLabeller({
			title: 'Work in progress',
			labels: ['feat', 'blocked'],
		});

		assert.deepEqual(added, []);
		assert.deepEqual(removed, ['feat']);
		assert.match(notices.join('\n'), /no conventional-commit type/);
	});

	test('ignores an unknown type rather than inventing a label', async () => {
		const { added } = await runLabeller({ title: 'wip(runtime): halfway there' });

		assert.deepEqual(added, []);
	});

	test('applies agent-authored from a ticked box, whoever pushed it', async () => {
		const { added, failures } = await runLabeller({
			title: 'feat(zag): add bindings',
			body: `## Summary\n\nA thing.\n\n## Provenance\n\n${TICKED}\n`,
		});

		assert.deepEqual(added, ['feat', 'agent-authored']);
		assert.deepEqual(failures, []);
	});

	test('labels and drafts a ready agent pull request in one workflow run', async () => {
		const { added, converted, failures } = await runLabeller({
			title: 'feat(zag): add bindings',
			body: `## Provenance\n\n${TICKED}\n`,
			runDraftPolicy: true,
		});

		assert.deepEqual(added, ['feat', 'agent-authored']);
		assert.deepEqual(converted, ['PR_node']);
		assert.deepEqual(failures, []);
	});

	test('does not redraft an agent pull request after a deliberate ready transition', async () => {
		const { converted, notices } = await runLabeller({
			body: `## Provenance\n\n${TICKED}\n`,
			runDraftPolicy: true,
			timeline: [{ event: 'ready_for_review' }],
		});

		assert.deepEqual(converted, []);
		assert.match(notices.join('\n'), /already marked ready for review/);
	});

	test('tolerates the checkbox spellings a real body contains', async () => {
		for (const line of [
			'- [X] An agent produced this diff (`agent-authored`)',
			'* [x] agent-authored',
			'  - [x]   agent-authored, via Claude Code',
		]) {
			const { added } = await runLabeller({
				title: 'docs: a thing',
				body: `## Provenance\n\n${line}\n`,
			});

			assert.ok(added.includes('agent-authored'), line);
		}
	});

	test('reads the box in the provenance section, not an earlier mention', async () => {
		const { added, failures } = await runLabeller({
			title: 'feat: a thing',
			body: `## Validation\n\n- [x] targeted tests: agent-authored fixtures\n\n## Provenance\n\n${EMPTY}\n`,
		});

		assert.deepEqual(added, ['feat']);
		assert.deepEqual(failures, []);
	});

	test('does not accept a provenance checkbox outside the provenance section', async () => {
		const { added, failures } = await runLabeller({
			title: 'feat: a thing',
			body: `## Validation\n\n${TICKED}\n`,
		});

		assert.deepEqual(added, ['feat']);
		assert.equal(failures.length, 1);
		assert.match(failures[0], /does not declare provenance/);
	});

	test('does not read a declaration out of a quoted example', async () => {
		const { added, failures } = await runLabeller({
			title: 'ci: document the box',
			body: `## Summary\n\nA body needs:\n\n\`\`\`md\n${TICKED}\n\`\`\`\n`,
		});

		assert.deepEqual(added, ['ci']);
		assert.equal(failures.length, 1);
		assert.match(failures[0], /does not declare provenance/);
	});

	test('does not read a declaration out of a commented-out box', async () => {
		const { added, failures } = await runLabeller({
			title: 'docs: a thing',
			body: `## Provenance\n\n<!--\n${TICKED}\n-->\n`,
		});

		assert.deepEqual(added, ['docs']);
		assert.equal(failures.length, 1);
	});

	test('reads the checked-in template as a declaration either way', async () => {
		const template = readFileSync(path.join(REPO, '.github/pull_request_template.md'), 'utf8');
		assert.ok(template.includes(EMPTY), 'the template must carry the provenance box');

		const human = await runLabeller({ title: 'fix: a thing', body: template });
		const agent = await runLabeller({
			title: 'fix: a thing',
			body: template.replace(EMPTY, TICKED),
		});

		assert.deepEqual(human.added, ['fix']);
		assert.deepEqual(human.failures, []);
		assert.deepEqual(agent.added, ['fix', 'agent-authored']);
		assert.deepEqual(agent.failures, []);
	});

	test('retracts the label when the box is unticked', async () => {
		const { added, removed } = await runLabeller({
			title: 'docs: a thing',
			labels: ['docs', 'agent-authored'],
		});

		assert.deepEqual(added, []);
		assert.deepEqual(removed, ['agent-authored']);
	});

	test('fails a body that skipped the template entirely', async () => {
		const { failures } = await runLabeller({
			title: 'feat: a thing',
			body: 'Body written by `gh pr create --fill`.',
		});

		assert.equal(failures.length, 1);
		assert.match(failures[0], /does not declare provenance/);
		assert.match(failures[0], /Editing the body re-runs this check/);
	});

	test('labels the pull request before failing on a missing declaration', async () => {
		// A red check must leave nothing to redo but the body itself.
		const { added, failures } = await runLabeller({
			title: 'feat: a thing',
			body: 'No template here.',
		});

		assert.deepEqual(added, ['feat']);
		assert.equal(failures.length, 1);
	});

	test('treats a missing declaration as silence, not a denial', async () => {
		// `gh pr create --fill` drops the template, so stripping the label here
		// would undo a maintainer while the check is already telling them to fix it.
		const { added, removed } = await runLabeller({
			title: 'docs: a thing',
			body: 'No template here.',
			labels: ['docs', 'agent-authored'],
		});

		assert.deepEqual(added, []);
		assert.deepEqual(removed, []);
	});

	test('never asks a generated pull request to declare anything', async () => {
		const { failures } = await runLabeller({
			title: 'Version Packages',
			body: 'Generated by Changesets.',
			user: { type: 'Bot' },
		});

		assert.deepEqual(failures, []);
	});

	test('writes nothing when the labels already match the declaration', async () => {
		const { added, removed, notices } = await runLabeller({
			title: 'docs: split the README',
			body: `## Provenance\n\n${TICKED}\n`,
			labels: ['docs', 'agent-authored'],
		});

		assert.deepEqual(added, []);
		assert.deepEqual(removed, []);
		assert.deepEqual(notices, []);
	});

	test('does nothing once the pull request has closed', async () => {
		const { added, removed, failures } = await runLabeller({
			title: 'feat: a thing',
			body: 'No template here.',
			state: 'closed',
		});

		assert.deepEqual(added, []);
		assert.deepEqual(removed, []);
		assert.deepEqual(failures, []);
	});

	test('runs with a writable token without checking out pull request code', () => {
		assert.match(
			labelWorkflow,
			/on:\n {2}pull_request_target:\n {4}types: \[opened, reopened, edited\]/,
		);
		assert.match(labelWorkflow, /^ {6}issues: read$/m);
		assert.match(labelWorkflow, /^ {6}pull-requests: write$/m);
		assert.match(
			labelWorkflow,
			/- name: Convert an agent-authored pull request back to draft[\s\S]*?if: always\(\)/,
		);
		assert.match(
			labelWorkflow,
			/github-token: \$\{\{ secrets\.DRAFT_PR_TOKEN \|\| secrets\.GITHUB_TOKEN \}\}/,
		);
		assert.doesNotMatch(labelWorkflow, /actions\/checkout/);
		assert.doesNotMatch(labelWorkflow, /contents: write/);
	});
});
