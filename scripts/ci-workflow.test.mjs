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
	test('runs no jobs for draft pull requests and starts when they become ready', () => {
		assert.match(
			workflow,
			/^  pull_request:\n    branches: \[main\]\n    types: \[opened, reopened, synchronize, ready_for_review, converted_to_draft\]$/m,
		);

		const draftGuard =
			/github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false/;
		const jobs = workflowJobs();
		assert.ok(jobs.length > 0, 'expected CI workflow jobs');
		for (const job of jobs) {
			assert.match(jobSource(job), draftGuard, `${job} must not run on a draft pull request`);
		}
	});

	test('does not turn a superseded run into failed aggregate checks', () => {
		for (const job of ['test', 'examples', 'lint', 'provenance']) {
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
			'typecheck',
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

		assert.doesNotMatch(jobSource('lint'), /outputs\.full_ci/);
		assert.match(jobSource('lint'), /run: pnpm ci:workflow:test/);
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
