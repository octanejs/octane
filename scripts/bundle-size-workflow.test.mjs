import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ci = read('.github/workflows/ci.yml');
const bundle = read('.github/workflows/bundle-size.yml');
const release = read('.github/workflows/release.yml');
const packageJson = JSON.parse(read('package.json'));

function jobSource(name) {
	const marker = `  ${name}:\n`;
	const start = ci.indexOf(marker);
	assert.notEqual(start, -1, `missing ${name} job`);
	const bodyStart = start + marker.length;
	const next = ci.slice(bodyStart).search(/\n  [a-zA-Z][a-zA-Z0-9_]*:\n/);
	return ci.slice(start, next === -1 ? undefined : bodyStart + next);
}

function runStep(workflow, name) {
	const marker = `      - name: ${name}\n`;
	const start = workflow.indexOf(marker);
	assert.notEqual(start, -1, `missing ${name} step`);
	const next = workflow.indexOf('\n      - name:', start + marker.length);
	const step = workflow.slice(start, next === -1 ? undefined : next);
	const script = step.match(/        run: \|\n((?:          .*\n|\n)*)/);
	assert.ok(script, `missing shell script for ${name}`);
	return script[1].replace(/^          /gm, '');
}

for (const [workflow, stepName, reportsHeadStatus] of [
	['pr-bench', 'Benchmark bundle size', true],
	['size-review', 'Measure bundles before and after', false],
]) {
	for (const [baseStatus, headStatus] of [
		[0, 0],
		[7, 0],
		[0, 9],
		[7, 9],
	]) {
		test(`${workflow} serializes bundle measurements and retains results when base=${baseStatus}, head=${headStatus}`, (t) => {
			const directory = mkdtempSync(join(tmpdir(), 'octane-bundle-workflow-'));
			t.after(() => rmSync(directory, { recursive: true, force: true }));
			const output = join(directory, 'output');
			writeFileSync(output, '');
			const events = join(directory, 'events');
			const lockModule = new URL('../benchmarks/lib/run-lock.mjs', import.meta.url).href;
			const benchmark = `import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';
import { acquireBenchmarkLock } from ${JSON.stringify(lockModule)};
const side = basename(process.cwd());
const record = (event) => appendFileSync(process.env.WORKFLOW_TEST_EVENTS, side + ':' + event + '\\n');
record('start');
const release = acquireBenchmarkLock(process.env.WORKFLOW_TEST_LOCK);
try {
  console.log(side + ' bundle measurement');
  // Keep a real lock held while a competing shell command can start. This is
  // controlled work, not a timing threshold or a benchmark measurement.
  await new Promise(resolve => setTimeout(resolve, 100));
  record('finish');
  process.exitCode = Number(process.env[side === 'base' ? 'WORKFLOW_TEST_BASE_STATUS' : 'WORKFLOW_TEST_HEAD_STATUS']);
} finally {
  release();
}
`;
			for (const side of ['base', 'head']) {
				const benchmarks = join(directory, side, 'benchmarks');
				mkdirSync(benchmarks, { recursive: true });
				writeFileSync(join(benchmarks, 'bench.mjs'), benchmark);
			}
			const result = spawnSync(
				'bash',
				[
					'--noprofile',
					'--norc',
					'-e',
					'-o',
					'pipefail',
					'-c',
					runStep(read(`.github/workflows/${workflow}.yml`), stepName),
				],
				{
					cwd: join(directory, 'head'),
					encoding: 'utf8',
					timeout: 10_000,
					env: {
						...process.env,
						BASE_TREE: join(directory, 'base'),
						RESULTS: join(directory, 'results'),
						GITHUB_OUTPUT: output,
						WORKFLOW_TEST_EVENTS: events,
						WORKFLOW_TEST_LOCK: join(directory, 'benchmark.lock'),
						WORKFLOW_TEST_BASE_STATUS: String(baseStatus),
						WORKFLOW_TEST_HEAD_STATUS: String(headStatus),
					},
				},
			);
			assert.equal(result.error, undefined);
			assert.equal(result.status, 0, result.stderr);
			assert.deepEqual(readFileSync(events, 'utf8').trim().split('\n'), [
				'base:start',
				'base:finish',
				'head:start',
				'head:finish',
			]);
			for (const side of ['base', 'head']) {
				assert.match(
					readFileSync(join(directory, 'results', `${side}-bytes.log`), 'utf8'),
					new RegExp(`${side} bundle measurement`),
				);
				assert.ok(result.stdout.includes(`${side} bundle measurement`));
			}
			assert.equal(
				result.stdout.includes('::warning::base bundle benchmarks failed'),
				baseStatus !== 0,
			);
			if (reportsHeadStatus) {
				assert.equal(readFileSync(output, 'utf8').trim(), `status=${headStatus}`);
			} else {
				assert.equal(
					result.stdout.includes('::warning::head bundle benchmarks failed'),
					headStatus !== 0,
				);
			}
		});
	}
}

test('runs bundle gates in a separate workflow without blocking runtime test execution', () => {
	const caller = jobSource('bundle_size');
	assert.match(caller, /uses: \.\/\.github\/workflows\/bundle-size\.yml/);
	assert.match(caller, /needs: release_change\n/);
	assert.doesNotMatch(caller, /needs:.*test/);
	assert.doesNotMatch(jobSource('test'), /bundle_size|BUNDLE_SIZE_RESULT/);
	assert.doesNotMatch(jobSource('test_shard'), /bundle-size|fetch-depth/);
	assert.match(bundle, /^on:\n  workflow_call:/m);
	assert.match(bundle, /^permissions:\n  contents: read$/m);
	assert.match(bundle, /persist-credentials: false/);
	assert.match(bundle, /node-version: 24/);
	assert.match(bundle, /pnpm install --prod=false --frozen-lockfile/);
});

test('retains every reachability gate exactly once and gates no byte count', () => {
	for (const command of [
		'node benchmarks/bundle-size/run-minimal.mjs\n',
		'node benchmarks/bundle-size/run.mjs octane-tsrx octane-jsx\n',
		'node benchmarks/bundle-size/run-hydration-free.mjs\n',
	]) {
		assert.equal(bundle.split(command).length - 1, 1, command);
		assert.ok(!ci.includes(command.trim()), `${command} must not remain in ordinary CI jobs`);
	}
	assert.doesNotMatch(bundle, /budget|ratchet|BUDGET_BASE/i);
	assert.doesNotMatch(bundle, /run-hydration-free\.mjs \S|continue-on-error/);
	for (const suite of [
		'scripts/bundle-size-workflow.test.mjs',
		'benchmarks/bundle-size/minimal-gates.test.mjs',
		'benchmarks/bundle-size/hydration-free-gates.test.mjs',
	]) {
		assert.ok(packageJson.scripts['ci:workflow:test'].split(' ').includes(suite), suite);
	}
});

test('builds only when CI has not authenticated inherited coverage', () => {
	const caller = jobSource('bundle_size');
	assert.match(
		caller,
		/run-benchmarks:.*outputs\.is_release != 'true'.*outputs\.full_ci != 'false'/,
	);
	assert.match(caller, /if:.*outputs\.is_release_pr != 'true'/);
	assert.doesNotMatch(caller.match(/^    if:.*$/m)[0], /full_ci|outputs\.is_release !=/);
	for (const step of [
		'Verify bundle reachability and root specialization',
		'Verify client-only bundles retain no hydration code',
	]) {
		assert.ok(bundle.includes(`- name: ${step}\n        if: inputs.run-benchmarks\n`));
	}
});

test('requires bundle success before recording reusable CI coverage or publishing', () => {
	const provenance = jobSource('provenance');
	assert.match(provenance, /needs:.*bundle_size/s);
	assert.match(provenance, /BUNDLE_SIZE_RESULT: \$\{\{ needs\.bundle_size\.result \}\}/);
	const script = provenance.slice(
		provenance.indexOf('        run: |\n') + '        run: |\n'.length,
	);
	for (const fullCi of ['true', 'false']) {
		for (const bundleResult of ['success', 'failure', 'skipped', 'cancelled']) {
			const result = spawnSync('bash', ['-e', '-c', script], {
				encoding: 'utf8',
				env: {
					...process.env,
					FULL_CI: fullCi,
					RELEASE_CHANGE_RESULT: 'success',
					BUNDLE_SIZE_RESULT: bundleResult,
					TEST_RESULT: 'success',
					LINT_RESULT: 'success',
					TYPECHECK_RESULT: 'success',
					EXAMPLES_RESULT: 'success',
					THREE_COMPAT_RESULT: fullCi === 'true' ? 'success' : 'skipped',
					LYNX_COMPAT_RESULT: fullCi === 'true' ? 'success' : 'skipped',
					PACKAGE_RESULT: fullCi === 'true' ? 'success' : 'skipped',
				},
			});
			assert.equal(result.status === 0, bundleResult === 'success', `${fullCi}: ${bundleResult}`);
		}
	}
});

test('release inheritance includes bundle coverage and emits the separate release check', () => {
	assert.match(ci, /const requiredTestJobs = \["test \(24\)", "CI provenance"\]/);
	assert.match(ci, /requiredTestJobs\.every\(\(name\) => successfulJobs\.has\(name\)\)/);
	assert.match(ci, /"bundle size \/ bundle size checks",/);
	assert.match(release, /\["lint", "typecheck", "bundle size \/ bundle size checks"\]\.map/);
});
