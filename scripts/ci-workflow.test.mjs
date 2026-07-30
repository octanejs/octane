import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(REPO, '.github/workflows/ci.yml'), 'utf8');
const publishWorkflow = readFileSync(path.join(REPO, '.github/workflows/publish.yml'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function jobSource(job) {
	const marker = `  ${job}:\n`;
	const start = workflow.indexOf(marker);
	assert.notEqual(start, -1, `missing ${job} job`);

	const bodyStart = start + marker.length;
	const nextJob = workflow.slice(bodyStart).search(/\n  [a-zA-Z][a-zA-Z0-9_]*:\n/);
	return workflow.slice(start, nextJob === -1 ? undefined : bodyStart + nextJob);
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
