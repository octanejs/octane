import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(REPO, '.github/workflows/ci.yml'), 'utf8');
const shardedVitestConfigSource = readFileSync(
	path.join(REPO, 'vitest.ci-sharded.config.js'),
	'utf8',
);
const vitestConfig = readFileSync(path.join(REPO, 'vitest.config.js'), 'utf8');
const packageJson = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const reactParityCheck = readFileSync(path.join(REPO, 'scripts/react-parity/check.mjs'), 'utf8');
const reactParityCheckLib = readFileSync(
	path.join(REPO, 'scripts/react-parity/check-lib.mjs'),
	'utf8',
);
const reactParityHarness = readFileSync(
	path.join(REPO, 'scripts/react-parity/harness.mjs'),
	'utf8',
);
const baseVitestModule = await import(pathToFileURL(path.join(REPO, 'vitest.config.js')));
const parityVitestModule = await import(
	pathToFileURL(path.join(REPO, 'vitest.react-parity.config.js'))
);
const { configureShardedProjects, default: shardedVitestConfig } = await import(
	pathToFileURL(path.join(REPO, 'vitest.ci-sharded.config.js'))
);
const publishWorkflow = readFileSync(path.join(REPO, '.github/workflows/publish.yml'), 'utf8');
const releaseWorkflow = readFileSync(path.join(REPO, '.github/workflows/release.yml'), 'utf8');
const draftWorkflow = readFileSync(
	path.join(REPO, '.github/workflows/draft-agent-prs.yml'),
	'utf8',
);
const labelWorkflow = readFileSync(path.join(REPO, '.github/workflows/label-pr.yml'), 'utf8');
const reviewReadinessWorkflow = readFileSync(
	path.join(REPO, '.github/workflows/review-readiness-label.yml'),
	'utf8',
);
const reviewFeedbackWorkflow = readFileSync(
	path.join(REPO, '.github/workflows/review-feedback-signal.yml'),
	'utf8',
);
const vercelPreviewWorkflow = readFileSync(
	path.join(REPO, '.github/workflows/vercel-preview.yml'),
	'utf8',
);
const websiteVercelConfig = JSON.parse(
	readFileSync(path.join(REPO, 'website/vercel.json'), 'utf8'),
);
const mcpVercelConfig = JSON.parse(
	readFileSync(path.join(REPO, 'website-mcp/vercel.json'), 'utf8'),
);
const createPrSkill = readFileSync(
	path.join(REPO, '.rulesync/skills/create-a-pr/SKILL.md'),
	'utf8',
);
const projectRule = readFileSync(path.join(REPO, '.rulesync/rules/project.md'), 'utf8');
const pullRequestTemplate = readFileSync(
	path.join(REPO, '.github/pull_request_template.md'),
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
	test('runs only required-check reporters for draft pull requests', () => {
		assert.match(
			workflow,
			/^  pull_request:\n    branches: \[main\]\n    types: \[opened, reopened, synchronize, ready_for_review, converted_to_draft, closed\]$/m,
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

	test('cancels closed pull request CI without replacing the merged main run', () => {
		assert.match(
			workflow,
			/^  group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}$/m,
		);
		assert.match(workflow, /^  cancel-in-progress: true$/m);

		for (const job of workflowJobs()) {
			assert.match(
				jobSource(job),
				/if:.*github\.event\.action != 'closed'/,
				`${job} must not start for the cancellation-only closed event`,
			);
		}
	});

	test('does not turn a superseded run into failed aggregate checks', () => {
		for (const job of ['test', 'examples', 'lint', 'typecheck', 'provenance']) {
			assert.match(jobSource(job), /if:.*always\(\).*!\s*cancelled\(\)/);
		}
	});

	test('keeps all Input OTP browser suites out of sharded unit tests', () => {
		const shard = jobSource('test_shard');
		assert.match(shard, /--exclude "packages\/input-otp\/tests\/browser\/\*\*\/\*"/);
		assert.doesNotMatch(shard, /input-otp\/tests\/browser\/\*\*\/\*\.spec\.ts/);
	});

	test('runs and reports tests only on Node 24 while retaining the Node 22 engine baseline', () => {
		const shard = jobSource('test_shard');
		assert.match(shard, /name: test shard \(Node 24, \$\{\{ matrix\.shard \}\}\)/);
		assert.equal([...shard.matchAll(/\bnode-version:/g)].length, 1);
		assert.match(shard, /^\s+node-version: 24$/m);
		assert.doesNotMatch(shard, /node-version: \[/);
		assert.equal(packageJson.engines.node, '>=22.22.2');

		const aggregate = jobSource('test');
		assert.match(aggregate, /^    name: test \(24\)$/m);
		assert.doesNotMatch(aggregate, /strategy:|matrix\.|required-context/);
		assert.doesNotMatch(workflow, /test \(22\)/);
		assert.doesNotMatch(publishWorkflow, /test \(22\)/);
		assert.match(publishWorkflow, /"test \(24\)"/);

		const provenance = stepScript(workflow, 'Verify full-suite provenance');
		assert.match(provenance, /`test shard \(Node 24, \$\{shard\}\)`/);
		assert.doesNotMatch(provenance, /\[22, 24\]/);
	});

	test('runs both Three compatibility lanes in one job with isolated worktrees', () => {
		const compat = jobSource('three_compat');
		const provenance = stepScript(workflow, 'Verify full-suite provenance');

		assert.match(compat, /^    name: Three compatibility$/m);
		assert.doesNotMatch(compat, /^    strategy:|matrix\./m);
		assert.doesNotMatch(compat, /^      THREE_(?:MINIMUM|CURRENT)_WORKSPACE:/m);
		assert.match(
			compat,
			/THREE_MINIMUM_WORKSPACE="\$RUNNER_TEMP\/octane-three-compat-minimum-r156"/,
		);
		assert.match(compat, /THREE_CURRENT_WORKSPACE="\$RUNNER_TEMP\/octane-three-compat-current"/);
		assert.match(compat, /git worktree add --detach "\$THREE_MINIMUM_WORKSPACE" "\$GITHUB_SHA"/);
		assert.match(compat, /git worktree add --detach "\$THREE_CURRENT_WORKSPACE" "\$GITHUB_SHA"/);
		assert.match(
			compat,
			/test "\$\(git -C "\$THREE_MINIMUM_WORKSPACE" rev-parse --git-dir\)" != "\$\(git -C "\$THREE_CURRENT_WORKSPACE" rev-parse --git-dir\)"/,
		);
		assert.match(
			compat,
			/name: Test Three compatibility \(minimum r156\)[\s\S]*?working-directory: \$\{\{ runner\.temp \}\}\/octane-three-compat-minimum-r156[\s\S]*?THREE_VERSION_SPEC: 0\.156\.0/,
		);
		assert.match(
			compat,
			/name: Test Three compatibility \(current\)[\s\S]*?working-directory: \$\{\{ runner\.temp \}\}\/octane-three-compat-current[\s\S]*?THREE_VERSION_SPEC: latest/,
		);
		assert.match(
			compat,
			/if: \$\{\{ !cancelled\(\) && steps\.prepare_three_compat\.outcome == 'success' \}\}/,
		);
		assert.equal([...compat.matchAll(/pnpm install --frozen-lockfile/g)].length, 2);
		assert.equal(
			[...compat.matchAll(/test "\$RESOLVED_THREE_VERSION" = "\$THREE_VERSION"/g)].length,
			2,
		);
		assert.equal(
			[...compat.matchAll(/test "\$THREE_RELEASE_LINE" = "\$TYPES_RELEASE_LINE"/g)].length,
			2,
		);
		assert.equal(
			[...compat.matchAll(/pnpm exec tsgo --noEmit -p packages\/three\/tsconfig\.json/g)].length,
			2,
		);
		assert.equal(
			[...compat.matchAll(/pnpm exec tsc --noEmit -p packages\/three\/typetests\/tsconfig\.json/g)]
				.length,
			2,
		);
		assert.equal([...compat.matchAll(/pnpm --dir packages\/three test:compat/g)].length, 2);
		assert.match(provenance, /^\s+"Three compatibility",$/m);
		assert.doesNotMatch(provenance, /Three compatibility \(\$\{lane\}\)/);
	});

	test('runs both Lynx compatibility lanes in one job through isolated processes', () => {
		const compat = jobSource('lynx_compat');
		const provenance = stepScript(workflow, 'Verify full-suite provenance');

		assert.match(compat, /^    name: Lynx compatibility$/m);
		assert.doesNotMatch(compat, /^    strategy:|matrix\./m);
		assert.equal([...compat.matchAll(/pnpm install --frozen-lockfile/g)].length, 1);
		assert.equal(
			[
				...compat.matchAll(
					/node packages\/rspeedy-plugin-octane\/scripts\/compatibility-smoke\.mjs/g,
				),
			].length,
			2,
		);
		assert.match(
			compat,
			/name: Pack and build Lynx minimum compatibility graph[\s\S]*?--lane minimum/,
		);
		assert.match(
			compat,
			/name: Pack and build Lynx current compatibility graph[\s\S]*?if: \$\{\{ !cancelled\(\) && steps\.install_lynx_dependencies\.outcome == 'success' \}\}[\s\S]*?--lane current/,
		);
		assert.match(provenance, /^\s+"Lynx compatibility",$/m);
		assert.doesNotMatch(provenance, /Lynx compatibility \(\$\{lane\}\)/);
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
			'react_parity_shard',
			'react_parity_checks',
			'website_e2e',
			'heavy_integration',
			'heavy_node_integration',
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

	test('accepts the generated Octane version source as release metadata', () => {
		const generatedVersionAllowance = /file\.filename === "packages\/octane\/src\/version\.ts"/;

		assert.match(
			stepScript(workflow, 'Identify a generated Changesets release change'),
			generatedVersionAllowance,
		);
		assert.match(
			stepScript(releaseWorkflow, 'Record lightweight release pull request checks'),
			generatedVersionAllowance,
		);
	});

	test('keeps cheap parity validation universal and full execution on Node 24', () => {
		const parity = jobSource('react_parity_shard');
		const parityAggregate = jobSource('react_parity_checks');
		const lint = jobSource('lint_checks');
		assert.match(parity, /name: React parity shard \(\$\{\{ matrix\.shard \}\}\/4\)/);
		assert.match(parity, /node-version: 24/);
		assert.doesNotMatch(parity, /node-version: \[22, 24\]/);
		assert.match(parity, /shard: \[1, 2, 3, 4\]/);
		assert.match(
			parity,
			/pnpm --filter website exec playwright install --with-deps chromium(?:\n|$)/,
		);
		assert.match(parity, /pnpm react-parity:check --shard \$\{\{ matrix\.shard \}\}\/4/);
		assert.match(
			parity,
			/REACT_PARITY_VITEST_REPORT: \$\{\{ runner\.temp \}\}\/react-parity-vitest\/shard-\$\{\{ matrix\.shard \}\}\.json/,
		);
		assert.match(parity, /actions\/upload-artifact@/);
		assert.doesNotMatch(parity, /pnpm react-parity:(?:test|validate)/);
		assert.match(parityAggregate, /^    name: React parity checks$/m);
		assert.match(parityAggregate, /needs: \[release_change, react_parity_shard\]/);
		assert.match(
			parityAggregate,
			/REACT_PARITY_SHARD_RESULT: \$\{\{ needs\.react_parity_shard\.result \}\}/,
		);
		assert.match(parityAggregate, /actions\/checkout@/);
		assert.match(parityAggregate, /actions\/download-artifact@/);
		assert.match(
			parityAggregate,
			/node scripts\/react-parity\/verify-vitest-shards\.mjs\s+--reports-directory/,
		);
		assert.match(parityAggregate, /--expected-shards 4/);
		assert.doesNotMatch(parityAggregate, /pnpm install|playwright install/);
		assert.match(lint, /pnpm react-parity:test/);
		assert.match(lint, /pnpm react-parity:validate/);
		assert.doesNotMatch(lint, /pnpm react-parity:check/);
		assert.equal(
			packageJson.scripts['react-parity:validate'],
			'node scripts/react-parity/check.mjs --validate-only',
		);
		assert.doesNotMatch(workflow, /hook-form/);

		assert.match(jobSource('release_change'), /"React parity checks"/);
		assert.match(
			jobSource('test_shard'),
			/pnpm test\s+--config vitest\.ci-sharded\.config\.js\s+--shard=/,
		);
		assert.doesNotMatch(vitestConfig, /defineTestProjects|ciOwnedProject|ciOwner/);
		assert.doesNotMatch(vitestConfig, /\bsharded\s*:/);
		assert.match(
			shardedVitestConfigSource,
			/const \{ testExecution, \.\.\.vitestProject \} = project/,
		);
		const baseProjects = new Map(
			baseVitestModule.default.test.projects.map((project) => [project.test?.name, project]),
		);
		const shardedProjects = new Map(
			shardedVitestConfig.test.projects.map((project) => [project.test?.name, project]),
		);
		for (const project of [
			'hook-form-pristine',
			'hook-form',
			'hook-form-differential',
			'hook-form-server',
		]) {
			assert.equal(baseProjects.get(project).testExecution.group, 'react-parity');
		}
		for (const project of ['hook-form', 'hook-form-server']) {
			assert.equal(baseProjects.get(project).test.maxWorkers, undefined);
			assert.equal(baseProjects.get(project).test.fileParallelism, undefined);
		}
		assert.equal(baseProjects.get('hook-form').test.globalSetup, undefined);
		assert.deepEqual(baseProjects.get('hook-form-differential').test.include, [
			'packages/hook-form/tests/differential/**/*.test.ts',
			'packages/hook-form/tests/differential/**/*.test.tsx',
		]);
		assert.deepEqual(baseProjects.get('hook-form-differential').test.globalSetup, [
			'packages/hook-form/tests/differential/_setup.ts',
		]);
		assert.equal(shardedProjects.has('hook-form-pristine'), false);
		assert.equal(shardedProjects.has('hook-form-differential'), false);
		assert.equal(shardedProjects.has('hook-form-server'), false);
		assert.deepEqual(shardedProjects.get('hook-form').test.include, [
			'packages/hook-form/tests/**/*.test.ts',
			'packages/hook-form/tests/**/*.test.tsx',
		]);
		for (const pattern of baseProjects.get('hook-form').testExecution.include) {
			assert.equal(shardedProjects.get('hook-form').test.exclude.includes(pattern), true);
		}
		assert.equal(shardedProjects.get('hook-form').testExecution, undefined);

		assert.deepEqual(baseProjects.get('dnd-kit').test.include, [
			'packages/dnd-kit/tests/conformance/**/*.test.ts',
			'packages/dnd-kit/tests/hydration/**/*.test.ts',
		]);
		assert.equal(baseProjects.get('dnd-kit').test.globalSetup, undefined);
		assert.equal(baseProjects.get('dnd-kit-differential').testExecution.group, 'react-parity');
		assert.deepEqual(baseProjects.get('dnd-kit-differential').test.include, [
			'packages/dnd-kit/tests/differential/**/*.test.ts',
		]);
		assert.deepEqual(baseProjects.get('dnd-kit-differential').test.globalSetup, [
			'packages/dnd-kit/tests/differential/_setup.ts',
		]);
		assert.equal(baseProjects.get('dnd-kit-differential').test.testTimeout, 30_000);
		assert.equal(shardedProjects.has('dnd-kit-differential'), false);

		const aggregate = jobSource('test');
		assert.match(
			aggregate,
			/needs:\s+\[\s+release_change,\s+test_shard,\s+react_parity_checks,\s+website_e2e,\s+heavy_integration,\s+heavy_node_integration,\s+\]/,
		);
		assert.match(aggregate, /REACT_PARITY_RESULT: \$\{\{ needs\.react_parity_checks\.result \}\}/);
		assert.match(aggregate, /test "\$REACT_PARITY_RESULT" = skipped/);
		assert.match(aggregate, /test "\$REACT_PARITY_RESULT" = success/);
		assert.match(
			aggregate,
			/HEAVY_NODE_INTEGRATION_RESULT: \$\{\{ needs\.heavy_node_integration\.result \}\}/,
		);
		assert.match(aggregate, /test "\$HEAVY_NODE_INTEGRATION_RESULT" = skipped/);
		assert.match(aggregate, /test "\$HEAVY_NODE_INTEGRATION_RESULT" = success/);

		// The manifest runner owns all required lanes for both verification states.
		// recorded-unverified limits the claim, not execution. Finish the complete
		// metadata preflight before starting the bounded executable work queue.
		assert.doesNotMatch(reactParityCheck, /provenance\.verification/);
		const manifestValidation = reactParityCheck.indexOf(
			'for (const relativeFile of BINDING_MANIFESTS)',
		);
		const manifestExecution = reactParityCheck.indexOf(
			"await capture('required Vitest React parity lanes'",
		);
		const executionContract = reactParityCheck.indexOf(
			"await capture('Vitest React parity execution contract'",
		);
		assert.notEqual(manifestValidation, -1);
		assert.ok(executionContract > manifestValidation);
		assert.ok(manifestExecution > executionContract);
		assert.ok(manifestExecution > manifestValidation);
		assert.match(reactParityCheck, /if \(!validateOnly && errors\.length === 0\)/);
		assert.match(
			reactParityCheck,
			/relativeFiles: nonVitestShard\.items\.map\(\(item\) => item\.relativeFile\)/,
		);
		assert.match(reactParityCheck, /const vitestLanes = loadRequiredVitestLanes\(REPO\)/);
		assert.doesNotMatch(reactParityCheck, /selectParityVitestShard|vitest-lane-timings/);
		assert.match(reactParityCheck, /reportPath: process\.env\.REACT_PARITY_VITEST_REPORT/);
		assert.match(reactParityCheck, /createRequiredNonVitestManifestShardPlan/);
		assert.match(reactParityCheck, /runRequiredVitestLanes/);
		assert.match(reactParityCheck, /concurrency: NON_VITEST_MANIFEST_CONCURRENCY/);
		assert.match(
			reactParityCheck,
			/const NON_VITEST_MANIFEST_CONCURRENCY = availableParallelism\(\)/,
		);
		assert.match(
			reactParityCheckLib,
			/\[harnessPath, 'run-required-non-vitest', '--manifest', relativeFile\]/,
		);
		assert.match(reactParityCheckLib, /vitest\.react-parity\.config\.js/);
		assert.match(reactParityCheckLib, /await Promise\.all\(/);
		const executionMarker = "} else {\n\tif (['run-required', 'run-required-non-vitest']";
		const executionStart = reactParityHarness.indexOf(executionMarker);
		assert.notEqual(executionStart, -1);
		const executionBranch = reactParityHarness.slice(executionStart);
		assert.doesNotMatch(executionBranch, /verifyManifestTestSelections/);
	});

	test('registers every required Vitest-backed manifest lane as react-parity owned', () => {
		const projects = new Map(
			baseVitestModule.default.test.projects.map((project) => [project.test?.name, project]),
		);
		const requiredVitestProjects = [];
		const nonVitestExecutions = new Set([
			'typescript',
			'jest-full',
			'node-full',
			'playwright-full',
		]);
		for (const entry of readdirSync(path.join(REPO, 'packages'), { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const manifestPath = path.join(REPO, 'packages', entry.name, 'audit/react-parity.json');
			if (!existsSync(manifestPath)) continue;
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			for (const lane of manifest.lanes) {
				if (nonVitestExecutions.has(lane.execution?.kind)) continue;
				assert.ok(lane.project, `${entry.name}/${lane.id}: missing Vitest project name`);
				const project = projects.get(lane.project);
				assert.ok(project, `${entry.name}/${lane.id}: unknown Vitest project ${lane.project}`);
				if (lane.oracle === 'required' && lane.available !== false) {
					assert.equal(
						project.testExecution?.group,
						'react-parity',
						`${entry.name}/${lane.id}: ${lane.project} must be react-parity owned`,
					);
					requiredVitestProjects.push(lane.project);
				}
			}
		}
		assert.deepEqual(
			parityVitestModule.default.test.projects.map((project) => project.test.name).sort(),
			requiredVitestProjects.sort(),
		);
		const inputOtpBrowser = parityVitestModule.default.test.projects.find(
			(project) => project.test.name === 'input-otp-browser',
		);
		assert.equal(inputOtpBrowser.test.fileParallelism, true);
		assert.equal(inputOtpBrowser.test.maxWorkers, undefined);
	});

	test('combines package, eval, loader, and Astro integration suites without coupling prerequisites', () => {
		const combined = jobSource('heavy_node_integration');
		const browser = jobSource('heavy_integration');
		const provenance = stepScript(workflow, 'Verify full-suite provenance');
		const title = 'heavy integration (package builds, eval corpus, runtime loaders, Astro)';

		assert.match(combined, new RegExp(`^    name: ${title.replace(/[()]/g, '\\$&')}$`, 'm'));
		assert.doesNotMatch(combined, /^    strategy:|matrix\./m);
		assert.equal([...combined.matchAll(/pnpm install --prod false --frozen-lockfile/g)].length, 1);
		assert.equal([...combined.matchAll(/oven-sh\/setup-bun/g)].length, 1);
		assert.equal([...combined.matchAll(/playwright install --with-deps chromium/g)].length, 1);
		for (const spec of [
			'website-mcp/tests/built-handler.e2e.test.ts',
			'packages/rspeedy-plugin-octane/tests/packed-consumer.test.ts',
			'packages/octane-evals/tests/user-app-corpus.test.ts',
			'packages/octane/tests/register-hook.test.ts',
			'packages/octane/tests/register-hook-bun.integration.test.mjs',
			'pnpm --dir packages/opentui test:native',
			'packages/astro/tests/astro.e2e.test.ts',
		]) {
			assert.ok(combined.includes(spec), `combined heavy integration must run ${spec}`);
			assert.doesNotMatch(browser, new RegExp(spec.replaceAll('.', '\\.')));
		}
		assert.match(
			combined,
			/name: Run eval-corpus integration tests\n\s+if: \$\{\{ !cancelled\(\) && steps\.install_heavy_node_dependencies\.outcome == 'success' \}\}/,
		);
		assert.match(
			combined,
			/name: Run Astro integration tests\n\s+if: \$\{\{ !cancelled\(\) && steps\.install_heavy_node_dependencies\.outcome == 'success' && steps\.install_heavy_node_chromium\.outcome == 'success' \}\}/,
		);
		assert.match(provenance, new RegExp(`^\\s+"${title.replace(/[()]/g, '\\$&')}",$`, 'm'));
		assert.doesNotMatch(provenance, /heavy integration \((?:package-builds|eval-corpus)\)/);
	});

	test('routes the Lynx Web host smoke through the combined Chromium build step', () => {
		const browserGlob = 'packages/rspeedy-plugin-octane/tests/browser/**/*.test.ts';
		const browserSpec = 'packages/rspeedy-plugin-octane/tests/browser/web-host.test.ts';
		assert.ok(jobSource('test_shard').includes(`--exclude "${browserGlob}"`));

		const combined = jobSource('heavy_node_integration');
		assert.match(combined, /playwright install --with-deps chromium/);
		assert.ok(combined.includes(browserSpec));

		const projects = new Map(
			baseVitestModule.default.test.projects.map((project) => [project.test?.name, project]),
		);
		assert.deepEqual(projects.get('rspeedy-plugin').test.include, [
			'packages/rspeedy-plugin-octane/tests/**/*.test.ts',
			`!${browserGlob}`,
		]);
		assert.equal(projects.get('rspeedy-plugin').test.exclude, undefined);
		assert.deepEqual(projects.get('rspeedy-plugin-browser').test.include, [browserGlob]);
	});

	test('derives sharded projects generically from execution-group ownership', () => {
		const projects = configureShardedProjects([
			{ test: { name: 'ordinary', include: ['ordinary/**/*.test.ts'] } },
			{
				testExecution: { group: 'react-parity' },
				test: { name: 'fully-owned', include: ['alpha/**/*.test.ts'] },
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['beta/parity/**/*.test.ts'],
				},
				test: {
					name: 'mixed',
					include: ['beta/**/*.test.ts'],
					exclude: ['beta/generated/**'],
				},
			},
		]);

		assert.deepEqual(
			projects.map((project) => project.test.name),
			['ordinary', 'mixed'],
		);
		assert.equal(projects[0].testExecution, undefined);
		assert.deepEqual(projects[1].test.exclude, ['beta/generated/**', 'beta/parity/**/*.test.ts']);
		assert.equal(projects[1].testExecution, undefined);
	});

	test('discovers ordinary browser suites only for Chromium', () => {
		const heavyIntegration = jobSource('heavy_integration');

		assert.match(heavyIntegration, /- lane: browser\n\s+playwright_browser: chromium/);
		assert.equal((heavyIntegration.match(/- lane: browser$/gm) ?? []).length, 1);
		assert.equal((heavyIntegration.match(/playwright install --with-deps/g) ?? []).length, 1);
		assert.match(heavyIntegration, /specs: discovered/);
		assert.match(heavyIntegration, /SPECS="\$\(node scripts\/discover-heavy-browser-specs\.mjs\)"/);
		assert.doesNotMatch(heavyIntegration, /packages\/draggable\/tests\/browser/);

		const discovered = execFileSync('node', ['scripts/discover-heavy-browser-specs.mjs'], {
			encoding: 'utf8',
			cwd: REPO,
		})
			.trim()
			.split(/\s+/);
		for (const browserRoot of [
			'playground/octane/tests/doom',
			'packages/colorful/tests/browser',
			'packages/dropzone/tests/probes/browser',
			'packages/octane/tests/browser',
			'packages/pdf/tests/feasibility/pdfjs.browser.test.ts',
			'packages/vaul/tests/browser-conformance',
		]) {
			assert.ok(discovered.includes(browserRoot));
		}
		for (const browserRoot of [
			'packages/draggable/tests/browser',
			'packages/drei/tests/browser',
			'packages/input-otp/tests/browser',
			'packages/rspeedy-plugin-octane/tests/browser',
			'packages/three/tests/browser',
		]) {
			assert.equal(discovered.includes(browserRoot), false);
		}
		for (const threeIntegration of [
			'packages/three/tests/browser/bundlers.test.ts',
			'packages/three/tests/browser/canvas.test.ts',
		]) {
			assert.ok(discovered.includes(threeIntegration));
		}
		const projects = new Map(
			baseVitestModule.default.test.projects.map((project) => [project.test?.name, project]),
		);
		const shardedProjects = new Map(
			shardedVitestConfig.test.projects.map((project) => [project.test?.name, project]),
		);
		for (const stalePrefix of [
			'react-day-picker',
			'react-draggable',
			'react-dropzone',
			'react-spring',
			'react-window',
		]) {
			assert.equal(
				[...projects.keys()].some(
					(name) => name === stalePrefix || name?.startsWith(`${stalePrefix}-`),
				),
				false,
				`${stalePrefix} must not remain in Octane Vitest project names`,
			);
		}
		function selectsFile(project, file) {
			const includes = project.test?.include ?? [];
			const excludes = project.test?.exclude ?? [];
			const matches = (pattern) => path.matchesGlob(file, pattern);
			return (
				includes.some((pattern) => !pattern.startsWith('!') && matches(pattern)) &&
				!includes.some((pattern) => pattern.startsWith('!') && matches(pattern.slice(1))) &&
				!excludes.some(matches)
			);
		}
		const browserFiles = new Set();
		for (const browserRoot of discovered) {
			const root = path.join(REPO, browserRoot);
			const files = statSync(root).isDirectory()
				? globSync('**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts,tsrx}', {
						cwd: root,
						exclude: ['**/node_modules/**', '**/.git/**'],
					}).map((file) => `${browserRoot}/${file}`)
				: [browserRoot];
			assert.ok(files.length > 0, `${browserRoot} must contain browser test files`);
			for (const file of files) browserFiles.add(file);
		}
		// Execution groups can share a discovery root while selecting disjoint files.
		// Every actual test must still run once, in Chromium, outside the unit shards.
		for (const file of browserFiles) {
			const owners = [...projects.values()].filter((project) => selectsFile(project, file));
			assert.equal(owners.length, 1, `${file} must have exactly one Vitest project`);
			assert.equal(
				owners[0].testExecution?.group,
				'heavy-browser',
				`${file} must belong to the heavy browser group`,
			);
			assert.ok(
				(owners[0].testExecution.browsers ?? ['chromium']).includes('chromium'),
				`${file} must run in Chromium`,
			);
			assert.equal(
				[...shardedProjects.values()].some((project) => selectsFile(project, file)),
				false,
				`${file} must be omitted from ordinary shards`,
			);
		}
		assert.deepEqual(projects.get('pdf-feasibility').testExecution, {
			group: 'heavy-browser',
			include: ['packages/pdf/tests/feasibility/pdfjs.browser.test.ts'],
		});
		assert.equal(
			shardedProjects
				.get('pdf-feasibility')
				.test.exclude.includes('packages/pdf/tests/feasibility/pdfjs.browser.test.ts'),
			true,
		);
		assert.equal(projects.get('three-browser').testExecution.group, 'react-parity');
		assert.equal(projects.get('three').testExecution.group, 'react-parity');

		assert.match(
			jobSource('test_shard'),
			/--exclude "packages\/three\/tests\/browser\/\*\*\/\*\.test\.ts"/,
		);
		assert.match(
			heavyIntegration,
			/playwright install --with-deps \$\{\{ matrix\.playwright_browser \}\}/,
		);
		assert.doesNotMatch(jobSource('lint_checks'), /@octanejs\/three.*playwright install/);
		assert.doesNotMatch(jobSource('react_parity_checks'), /@octanejs\/three/);
	});
});

describe('Publish workflow validation', () => {
	test('owns GitHub tag and release reconciliation outside changesets/action', () => {
		assert.match(publishWorkflow, /createGithubReleases:\s*false/);
		assert.match(
			publishWorkflow,
			/- name: Reconcile GitHub tags and releases[\s\S]*?if: always\(\) && steps\.npm_release\.outcome == 'success'[\s\S]*?run: pnpm release:reconcile/,
		);
		assert.match(publishWorkflow, /RELEASE_SHA: \$\{\{ steps\.release\.outputs\.sha \}\}/);
	});

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
		// GitHub's GraphQL permission mapping requires both grants even though
		// converting a pull request to draft does not change repository content.
		assert.match(draftWorkflow, /^ {6}contents: write$/m);
		assert.match(
			draftWorkflow,
			/github-token: \$\{\{ secrets\.DRAFT_PR_TOKEN \|\| secrets\.GITHUB_TOKEN \}\}/,
		);
	});
});

describe('Agent pull request body policy', () => {
	test('preserves bot-managed summaries when updating an existing pull request', () => {
		assert.match(createPrSkill, /fetch its current body with `gh pr view`/);
		assert.match(createPrSkill, /preserve them\s+byte-for-byte/);
		assert.match(createPrSkill, /After `gh pr edit`, fetch it again and verify/);

		for (const source of [createPrSkill, projectRule]) {
			assert.match(source, /<!-- CURSOR_SUMMARY -->/);
			assert.match(source, /<!-- \/CURSOR_SUMMARY -->/);
		}
		assert.match(pullRequestTemplate, /Preserve every bot-managed HTML comment region/);
		assert.match(pullRequestTemplate, /never replace the body from a fresh template/);
	});
});

describe('Pull request labels', () => {
	const TICKED = '- [x] An agent produced this diff (`agent-authored`)';
	const EMPTY = '- [ ] An agent produced this diff (`agent-authored`)';

	function runLabeller({
		title = 'chore: a thing',
		headRef = 'topic/a-thing',
		body = `## Provenance\n\n${EMPTY}\n`,
		labels = [],
		state = 'open',
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
			head: { ref: headRef },
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

	test('falls back to a type-prefixed title or head branch', async () => {
		for (const [title, headRef, type] of [
			['fix/gallery-list-fills-wrapper', 'topic/gallery-list', 'fix'],
			['Add Solana bindings', 'feat/solana-kit-binding', 'feat'],
		]) {
			const { added, removed, failures } = await runLabeller({ title, headRef });

			assert.deepEqual(added, [type], `${title} (${headRef})`);
			assert.deepEqual(removed, []);
			assert.deepEqual(failures, []);
		}
	});

	test('moves the type label when a pull request is retitled', async () => {
		const { added, removed } = await runLabeller({
			title: 'fix(compiler): render the non-JSX arm',
			headRef: 'feat/old-compiler-work',
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

	test('treats a provenance checkbox outside the provenance section as human-authored', async () => {
		const { added, failures } = await runLabeller({
			title: 'feat: a thing',
			body: `## Validation\n\n${TICKED}\n`,
		});

		assert.deepEqual(added, ['feat']);
		assert.deepEqual(failures, []);
	});

	test('does not read a declaration out of a quoted example', async () => {
		const { added, failures } = await runLabeller({
			title: 'ci: document the box',
			body: `## Summary\n\nA body needs:\n\n\`\`\`md\n${TICKED}\n\`\`\`\n`,
		});

		assert.deepEqual(added, ['ci']);
		assert.deepEqual(failures, []);
	});

	test('does not read a declaration out of a commented-out box', async () => {
		const { added, failures } = await runLabeller({
			title: 'docs: a thing',
			body: `## Provenance\n\n<!--\n${TICKED}\n-->\n`,
		});

		assert.deepEqual(added, ['docs']);
		assert.deepEqual(failures, []);
	});

	test('reads the checked-in template as a declaration either way', async () => {
		assert.ok(pullRequestTemplate.includes(EMPTY), 'the template must carry the provenance box');

		const human = await runLabeller({ title: 'fix: a thing', body: pullRequestTemplate });
		const agent = await runLabeller({
			title: 'fix: a thing',
			body: pullRequestTemplate.replace(EMPTY, TICKED),
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

	test('treats a body without provenance as human-authored', async () => {
		for (const body of [null, '', 'Body written by `gh pr create --fill`.']) {
			const { added, removed, failures } = await runLabeller({
				title: 'feat: a thing',
				body,
			});

			assert.deepEqual(added, ['feat'], String(body));
			assert.deepEqual(removed, [], String(body));
			assert.deepEqual(failures, [], String(body));
		}
	});

	test('still applies the type label when provenance is missing', async () => {
		const { added, failures } = await runLabeller({
			title: 'feat: a thing',
			body: 'No template here.',
		});

		assert.deepEqual(added, ['feat']);
		assert.deepEqual(failures, []);
	});

	test('removes a stale agent label when provenance is missing', async () => {
		const { added, removed, converted, failures } = await runLabeller({
			title: 'docs: a thing',
			body: 'No template here.',
			labels: ['docs', 'agent-authored'],
			runDraftPolicy: true,
		});

		assert.deepEqual(added, []);
		assert.deepEqual(removed, ['agent-authored']);
		assert.deepEqual(converted, []);
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
		assert.match(labelWorkflow, /^ {6}contents: write$/m);
		assert.match(
			labelWorkflow,
			/- name: Convert an agent-authored pull request back to draft[\s\S]*?if: always\(\)/,
		);
		assert.match(
			labelWorkflow,
			/github-token: \$\{\{ secrets\.DRAFT_PR_TOKEN \|\| secrets\.GITHUB_TOKEN \}\}/,
		);
		assert.doesNotMatch(labelWorkflow, /actions\/checkout/);
		assert.equal(
			(labelWorkflow.match(/^ {10}retries: 3$/gm) ?? []).length,
			2,
			'both GitHub API steps retry transient failures',
		);
	});
});

describe('Review readiness label', () => {
	const READY = 'READY FOR REVIEW';

	function reviewThread({ resolved = false } = {}) {
		return {
			isResolved: resolved,
			comments: {
				nodes: [
					{
						url: 'https://github.com/octanejs/octane/pull/487#discussion_r1',
					},
				],
			},
		};
	}

	async function runReadiness({
		eventName = 'issue_comment',
		body = READY,
		labels = [],
		threads = [],
		matchingPulls = [{ number: 487, labels: { nodes: [{ name: READY }] } }],
		removeErrorStatus,
	} = {}) {
		const added = [];
		const removed = [];
		const notices = [];
		const failures = [];
		const pull = {
			state: 'open',
			labels: labels.map((name) => ({ name })),
		};
		const github = {
			graphql: async (query) => {
				if (query.includes('pullRequests(first: 100')) {
					return {
						repository: {
							pullRequests: {
								nodes: matchingPulls,
								pageInfo: { hasNextPage: false, endCursor: null },
							},
						},
					};
				}
				if (query.includes('reviewThreads(first: 100')) {
					return {
						repository: {
							pullRequest: {
								reviewThreads: {
									nodes: threads,
									pageInfo: { hasNextPage: false, endCursor: null },
								},
							},
						},
					};
				}
				throw new Error('unexpected GraphQL query');
			},
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
						if (removeErrorStatus) {
							const error = new Error(`remove failed with ${removeErrorStatus}`);
							error.status = removeErrorStatus;
							throw error;
						}
						removed.push(name);
						pull.labels = pull.labels.filter((label) => label.name !== name);
					},
				},
			},
		};
		const context = {
			eventName,
			repo: { owner: 'octanejs', repo: 'octane' },
			payload:
				eventName === 'workflow_run'
					? { workflow_run: { conclusion: 'success' } }
					: { issue: { number: 487 }, comment: { body } },
		};
		const core = {
			notice: (message) => notices.push(message),
			setFailed: (message) => failures.push(message),
		};
		const execute = new AsyncFunction(
			'github',
			'context',
			'core',
			stepScript(reviewReadinessWorkflow, 'Reconcile review readiness'),
		);

		await execute(github, context, core);
		return { added, removed, notices, failures };
	}

	test('bridges unprivileged review comments to writable default-branch reconciliation', () => {
		assert.match(
			reviewFeedbackWorkflow,
			/on:\n {2}pull_request_review_comment:\n {4}types: \[created\]/,
		);
		assert.match(reviewFeedbackWorkflow, /^permissions: \{\}$/m);
		assert.doesNotMatch(reviewFeedbackWorkflow, /actions\/checkout/);

		assert.match(
			reviewReadinessWorkflow,
			/on:\n {2}issue_comment:\n {4}types: \[created, edited\]/,
		);
		assert.match(
			reviewReadinessWorkflow,
			/workflow_run:\n {4}workflows: \[Review feedback signal\]\n {4}types: \[completed\]/,
		);
		assert.match(
			reviewReadinessWorkflow,
			/github\.event_name == 'issue_comment' && github\.event\.issue\.pull_request/,
		);
		assert.match(reviewReadinessWorkflow, /github\.event_name == 'workflow_run'/);
		assert.doesNotMatch(reviewReadinessWorkflow, /github\.event\.workflow_run\.conclusion/);
		assert.match(reviewReadinessWorkflow, /^ {6}issues: read$/m);
		assert.match(reviewReadinessWorkflow, /^ {6}pull-requests: write$/m);
		assert.doesNotMatch(reviewReadinessWorkflow, /actions\/checkout/);
	});

	test('applies readiness when every review thread is resolved', async () => {
		const result = await runReadiness({
			threads: [reviewThread({ resolved: true })],
		});

		assert.deepEqual(result.added, [READY]);
		assert.deepEqual(result.removed, []);
		assert.deepEqual(result.failures, []);
	});

	test('refuses readiness while any reviewer thread is unresolved', async () => {
		const result = await runReadiness({ threads: [reviewThread()] });

		assert.deepEqual(result.added, []);
		assert.deepEqual(result.removed, []);
		assert.match(result.notices.join('\n'), /Did not apply READY FOR REVIEW/);
		assert.deepEqual(result.failures, []);
	});

	test('removes readiness after new unresolved review feedback', async () => {
		const result = await runReadiness({
			eventName: 'workflow_run',
			labels: [READY],
			threads: [reviewThread()],
		});

		assert.deepEqual(result.added, []);
		assert.deepEqual(result.removed, [READY]);
		assert.match(result.notices.join('\n'), /Removed READY FOR REVIEW/);
		assert.deepEqual(result.failures, []);
	});

	test('treats a concurrently removed readiness label as already absent', async () => {
		const result = await runReadiness({
			eventName: 'workflow_run',
			labels: [READY],
			threads: [reviewThread()],
			removeErrorStatus: 404,
		});

		assert.deepEqual(result.added, []);
		assert.deepEqual(result.removed, []);
		assert.match(result.notices.join('\n'), /already absent/);
		assert.deepEqual(result.failures, []);
	});

	test('still fails when readiness removal returns another API error', async () => {
		const result = await runReadiness({
			eventName: 'workflow_run',
			labels: [READY],
			threads: [reviewThread()],
			removeErrorStatus: 500,
		});

		assert.match(result.failures.join('\n'), /remove failed with 500/);
	});
});

describe('Vercel preview workflow', () => {
	const sha = 'a'.repeat(40);
	const deploymentSha = 'd'.repeat(40);
	const treeSha = 'e'.repeat(40);
	const pull = {
		number: 612,
		state: 'open',
		labels: [{ name: 'deploy-preview' }],
		base: { sha: 'b'.repeat(40) },
		head: {
			sha,
			ref: 'feature/preview-this',
			repo: { id: 12345 },
		},
	};

	async function runPreview({
		action = 'labeled',
		labelName = action === 'closed' ? undefined : 'deploy-preview',
		pullResponse = pull,
		comments = [],
		existingRef = null,
		deleteRefError = null,
		deploymentSnapshots = [],
	} = {}) {
		const gitCalls = [];
		const deploymentQueries = [];
		const writtenComments = [];
		const warnings = [];
		const failures = [];
		const notices = [];
		let currentRef = existingRef;
		let activeSnapshot = [];
		let deploymentRead = 0;
		let nextCommentId = 900;
		let now = 0;
		const github = {
			rest: {
				pulls: { get: async () => ({ data: structuredClone(pullResponse) }) },
				git: {
					getCommit: async (input) => {
						gitCalls.push({ operation: 'get-commit', ...input });
						return { data: { sha, tree: { sha: treeSha } } };
					},
					createCommit: async (input) => {
						gitCalls.push({ operation: 'create-commit', ...input });
						return { data: { sha: deploymentSha, tree: { sha: input.tree } } };
					},
					getRef: async (input) => {
						gitCalls.push({ operation: 'get', ...input });
						if (currentRef === null) {
							throw Object.assign(new Error('missing ref'), { status: 404 });
						}
						return { data: { object: { sha: currentRef } } };
					},
					createRef: async (input) => {
						gitCalls.push({ operation: 'create', ...input });
						currentRef = input.sha;
						return { data: { ref: input.ref, object: { sha: input.sha } } };
					},
					updateRef: async (input) => {
						gitCalls.push({ operation: 'update', ...input });
						currentRef = input.sha;
						return { data: { ref: input.ref, object: { sha: input.sha } } };
					},
					deleteRef: async (input) => {
						gitCalls.push({ operation: 'delete', ...input });
						if (deleteRefError) throw deleteRefError;
						if (currentRef === null) {
							throw Object.assign(new Error('missing ref'), { status: 404 });
						}
						currentRef = null;
					},
				},
				repos: {
					listDeployments: async (input) => {
						deploymentQueries.push({ operation: 'deployments', ...input });
						activeSnapshot =
							deploymentSnapshots[
								Math.min(deploymentRead++, Math.max(deploymentSnapshots.length - 1, 0))
							] ?? [];
						return {
							data: activeSnapshot.map(({ state: _state, url: _url, ...deployment }) =>
								structuredClone(deployment),
							),
						};
					},
					listDeploymentStatuses: async (input) => {
						deploymentQueries.push({ operation: 'statuses', ...input });
						const deployment = activeSnapshot.find(
							(candidate) => candidate.id === input.deployment_id,
						);
						return {
							data: deployment
								? [
										{
											state: deployment.state,
											environment_url: deployment.url,
										},
									]
								: [],
						};
					},
				},
				issues: {
					listComments: async () => undefined,
					createComment: async ({ body }) => {
						const data = {
							id: nextCommentId++,
							body,
							user: { login: 'github-actions[bot]' },
						};
						writtenComments.push({ operation: 'create', ...data });
						return { data };
					},
					updateComment: async ({ comment_id, body }) => {
						const data = {
							id: comment_id,
							body,
							user: { login: 'github-actions[bot]' },
						};
						writtenComments.push({ operation: 'update', ...data });
						return { data };
					},
				},
			},
			paginate: async () => structuredClone(comments),
		};
		const execute = new AsyncFunction(
			'github',
			'context',
			'core',
			'Date',
			'setTimeout',
			stepScript(vercelPreviewWorkflow, 'Publish preview branch and report Vercel deployments'),
		);
		await execute(
			github,
			{
				repo: { owner: 'octanejs', repo: 'octane' },
				payload: {
					action,
					label: labelName ? { name: labelName } : undefined,
					pull_request: { number: pullResponse.number },
					sender: { id: 329182, login: 'leonidaz' },
				},
				runId: 1234,
				runAttempt: 1,
			},
			{
				notice: (message) => notices.push(message),
				setFailed: (message) => failures.push(message),
				warning: (message) => warnings.push(message),
			},
			class extends Date {
				constructor(...args) {
					super(...(args.length > 0 ? args : [now]));
				}

				static now() {
					return now;
				}
			},
			(callback, delay) => {
				now += delay;
				callback();
			},
		);
		return {
			currentRef,
			deploymentQueries,
			gitCalls,
			writtenComments,
			warnings,
			failures,
			notices,
		};
	}

	const successfulDeployments = [
		{
			id: 101,
			environment: 'Preview – octane-website',
			creator: { login: 'vercel[bot]' },
			state: 'success',
			url: 'https://website-preview.vercel.app',
		},
		{
			id: 102,
			environment: 'Preview – octane-website-mcp',
			creator: { login: 'vercel[bot]' },
			state: 'success',
			url: 'https://mcp-preview.vercel.app',
		},
	];

	test('publishes the authorized SHA and refreshes the existing PR comment from GitHub deployments', async () => {
		const { deploymentQueries, gitCalls, writtenComments, failures } = await runPreview({
			comments: [
				{
					id: 71,
					body: '<!-- octane-vercel-preview -->\nOld preview',
					user: { login: 'github-actions[bot]' },
				},
			],
			deploymentSnapshots: [[], successfulDeployments],
		});

		assert.deepEqual(
			gitCalls.filter((call) => call.operation === 'create-commit'),
			[
				{
					operation: 'create-commit',
					owner: 'octanejs',
					repo: 'octane',
					message: [
						'chore: deploy preview for #612',
						'',
						'Authorized-by: @leonidaz',
						`Source: ${sha}`,
						'Run: 1234/1',
					].join('\n'),
					tree: treeSha,
					parents: [sha],
					author: {
						name: 'leonidaz',
						email: '329182+leonidaz@users.noreply.github.com',
						date: '1970-01-01T00:00:00.000Z',
					},
					committer: {
						name: 'leonidaz',
						email: '329182+leonidaz@users.noreply.github.com',
						date: '1970-01-01T00:00:00.000Z',
					},
				},
			],
		);
		assert.deepEqual(
			gitCalls.filter((call) => call.operation === 'create'),
			[
				{
					operation: 'create',
					owner: 'octanejs',
					repo: 'octane',
					ref: 'refs/heads/deploy-preview-pr-612',
					sha: pull.base.sha,
				},
			],
		);
		assert.deepEqual(
			gitCalls.filter((call) => call.operation === 'update'),
			[
				{
					operation: 'update',
					owner: 'octanejs',
					repo: 'octane',
					ref: 'heads/deploy-preview-pr-612',
					sha: deploymentSha,
					force: true,
				},
			],
		);
		assert.ok(
			deploymentQueries
				.filter((query) => query.operation === 'deployments')
				.every((query) => query.sha === deploymentSha && query.per_page === 100),
		);
		assert.ok(writtenComments.every((comment) => comment.operation === 'update'));
		assert.ok(writtenComments.every((comment) => comment.id === 71));
		assert.match(writtenComments.at(-1).body, /via `deploy-preview-pr-612`/);
		assert.match(writtenComments.at(-1).body, /deployment commit `ddddddd`/);
		assert.match(writtenComments.at(-1).body, /https:\/\/website-preview\.vercel\.app/);
		assert.match(writtenComments.at(-1).body, /https:\/\/mcp-preview\.vercel\.app/);
		assert.match(writtenComments.at(-1).body, /SUCCESS/);
		assert.deepEqual(failures, []);
	});

	test('moves an existing preview branch to a unique authorized deployment commit', async () => {
		const previousSha = 'c'.repeat(40);
		const { currentRef, gitCalls, failures } = await runPreview({
			existingRef: previousSha,
			deploymentSnapshots: [successfulDeployments],
		});

		assert.equal(currentRef, deploymentSha);
		assert.deepEqual(
			gitCalls.filter((call) => call.operation === 'update'),
			[
				{
					operation: 'update',
					owner: 'octanejs',
					repo: 'octane',
					ref: 'heads/deploy-preview-pr-612',
					sha: deploymentSha,
					force: true,
				},
			],
		);
		assert.deepEqual(failures, []);
	});

	test('re-emits a push when the preview branch already points at the source SHA', async () => {
		const { currentRef, gitCalls, failures } = await runPreview({
			existingRef: sha,
			deploymentSnapshots: [successfulDeployments],
		});

		assert.equal(currentRef, deploymentSha);
		assert.deepEqual(
			gitCalls.filter((call) => call.operation === 'update'),
			[
				{
					operation: 'update',
					owner: 'octanejs',
					repo: 'octane',
					ref: 'heads/deploy-preview-pr-612',
					sha: deploymentSha,
					force: true,
				},
			],
		);
		assert.deepEqual(failures, []);
	});

	test('publishes a labeled preview when the pull request head matches its base', async () => {
		const { currentRef, writtenComments, failures } = await runPreview({
			pullResponse: { ...pull, base: { sha } },
			deploymentSnapshots: [successfulDeployments],
		});

		assert.equal(currentRef, deploymentSha);
		assert.match(writtenComments.at(-1).body, /SUCCESS/);
		assert.deepEqual(failures, []);
	});

	test('does not publish a ref if the label was removed before a queued run starts', async () => {
		const { deploymentQueries, gitCalls, writtenComments, notices } = await runPreview({
			pullResponse: { ...pull, labels: [] },
		});

		assert.deepEqual(gitCalls, []);
		assert.deepEqual(deploymentQueries, []);
		assert.deepEqual(writtenComments, []);
		assert.match(notices.join('\n'), /deploy-preview is no longer applied/);
	});

	test('deletes the temporary branch when preview authorization is removed', async () => {
		const { currentRef, deploymentQueries, gitCalls, writtenComments, failures } = await runPreview(
			{ action: 'unlabeled', existingRef: sha },
		);

		assert.equal(currentRef, null);
		assert.deepEqual(gitCalls, [
			{
				operation: 'get',
				owner: 'octanejs',
				repo: 'octane',
				ref: 'heads/deploy-preview-pr-612',
			},
			{
				operation: 'delete',
				owner: 'octanejs',
				repo: 'octane',
				ref: 'heads/deploy-preview-pr-612',
			},
		]);
		assert.deepEqual(deploymentQueries, []);
		assert.deepEqual(writtenComments, []);
		assert.deepEqual(failures, []);
	});

	test('treats cleanup after the pull request closes as idempotent', async () => {
		const { gitCalls, failures, notices } = await runPreview({ action: 'closed' });

		assert.equal(gitCalls.length, 1);
		assert.equal(gitCalls[0].operation, 'get');
		assert.match(notices.join('\n'), /already absent/);
		assert.deepEqual(failures, []);
	});

	test('treats a preview branch removed during cleanup as already absent', async () => {
		const deleteRefError = Object.assign(new Error('Reference does not exist'), {
			status: 422,
			response: { data: { message: 'Reference does not exist' } },
		});
		const { gitCalls, failures, notices } = await runPreview({
			action: 'closed',
			existingRef: sha,
			deleteRefError,
		});

		assert.deepEqual(
			gitCalls.map((call) => call.operation),
			['get', 'delete'],
		);
		assert.match(notices.join('\n'), /already absent/);
		assert.deepEqual(failures, []);
	});

	test('reports a terminal Vercel failure on the pull request and workflow', async () => {
		const failedDeployments = structuredClone(successfulDeployments);
		failedDeployments[1].state = 'failure';
		const { failures, writtenComments } = await runPreview({
			deploymentSnapshots: [failedDeployments],
		});

		assert.match(failures.join('\n'), /MCP website: failure/);
		assert.match(writtenComments.at(-1).body, /FAILURE/);
	});

	test('fails with a useful diagnostic when Vercel never reports either deployment', async () => {
		const { failures, writtenComments } = await runPreview();

		assert.match(failures.join('\n'), /Website: Vercel did not report a deployment/);
		assert.match(failures.join('\n'), /MCP website: Vercel did not report a deployment/);
		assert.match(writtenComments.at(-1).body, /URL pending/);
	});

	test('keeps production automatic and delegates labeled previews to the Vercel GitHub App', () => {
		for (const config of [websiteVercelConfig, mcpVercelConfig]) {
			assert.deepEqual(config.git.deploymentEnabled, {
				'*': false,
				'**': false,
				main: true,
				'deploy-preview-pr-*': true,
			});
		}

		assert.match(
			vercelPreviewWorkflow,
			/on:\n {2}pull_request_target:\n {4}types: \[labeled, unlabeled, closed\]/,
		);
		assert.match(
			vercelPreviewWorkflow,
			/if: github\.event\.action == 'closed' \|\| github\.event\.label\.name == 'deploy-preview'/,
		);
		assert.match(vercelPreviewWorkflow, /^ {6}contents: write$/m);
		assert.match(vercelPreviewWorkflow, /^ {6}deployments: read$/m);
		assert.match(vercelPreviewWorkflow, /^ {6}issues: write$/m);
		assert.match(vercelPreviewWorkflow, /^ {6}pull-requests: write$/m);
		assert.match(
			vercelPreviewWorkflow,
			/^ {6}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \}\}$/m,
		);
		assert.match(vercelPreviewWorkflow, /^ {6}cancel-in-progress: false$/m);
		assert.match(vercelPreviewWorkflow, /BRANCH_PREFIX = "deploy-preview-pr-"/);
		assert.match(vercelPreviewWorkflow, /github\.rest\.git\.createRef/);
		assert.match(vercelPreviewWorkflow, /github\.rest\.git\.createCommit/);
		assert.match(vercelPreviewWorkflow, /github\.rest\.git\.updateRef/);
		assert.match(vercelPreviewWorkflow, /github\.rest\.repos\.listDeployments/);
		assert.doesNotMatch(vercelPreviewWorkflow, /actions\/checkout/);
		assert.doesNotMatch(vercelPreviewWorkflow, /VERCEL_/);
		assert.doesNotMatch(vercelPreviewWorkflow, /fetch\(/);
		assert.doesNotMatch(vercelPreviewWorkflow, /^ {8}run:/m);
	});
});
