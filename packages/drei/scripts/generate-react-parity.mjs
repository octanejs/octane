#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const packageRoot = resolve(root, 'packages/drei');
const auditRoot = resolve(packageRoot, 'audit');
const portable = (value) => value.replaceAll('\\', '/');
const digest = (value) => createHash('sha256').update(value).digest('hex');

const OCTANE_ONLY_GUARDS = new Set([
	'packages/drei/tests/config.test.ts',
	'packages/drei/tests/crosswalk-guard.test.ts',
	'packages/drei/tests/react-parity-guard.test.ts',
	'packages/drei/tests/view-renderer-boundary.test.ts',
]);
const isOctaneOnly = (path) =>
	OCTANE_ONLY_GUARDS.has(path) || path.includes('/tests/octane-contracts/');

function listProject(project) {
	return JSON.parse(
		execFileSync(
			process.execPath,
			['node_modules/vitest/vitest.mjs', 'list', '--project', project, '--json'],
			{
				cwd: root,
				encoding: 'utf8',
				maxBuffer: 16 * 1024 * 1024,
			},
		),
	)
		.map((test) => ({
			file: portable(relative(root, test.file)),
			fullName: test.name.replaceAll(' > ', ' '),
		}))
		.filter((test) => test.file.startsWith('packages/drei/tests/'))
		.sort((left, right) => {
			const leftKey = `${left.file}\0${left.fullName}`;
			const rightKey = `${right.file}\0${right.fullName}`;
			return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
		});
}

function withIds(tests) {
	const occurrences = new Map();
	return tests.map((test) => {
		const base = `runtime:${digest(`${test.file}\0${test.fullName}`).slice(0, 16)}`;
		const occurrence = occurrences.get(base) ?? 0;
		occurrences.set(base, occurrence + 1);
		return { id: occurrence === 0 ? base : `${base}:${occurrence + 1}`, ...test };
	});
}

const differentialTests = withIds(listProject('drei-differential'));
const browserTests = withIds(listProject('drei-adapted-browser'));
const guardTests = listProject('drei-guards');
const typeTests = readdirSync(resolve(root, 'packages/drei/typetests'), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile() && entry.name.endsWith('.test-d.ts'))
	.map((entry) => portable(relative(root, resolve(entry.parentPath, entry.name))))
	.sort();

const inventory = {
	schemaVersion: 1,
	project: 'drei-differential',
	roots: ['packages/drei/tests'],
	files: [...new Set(differentialTests.map((test) => test.file))],
	tests: differentialTests,
};
const browserInventory = {
	schemaVersion: 1,
	project: 'drei-adapted-browser',
	roots: ['packages/drei/tests/browser'],
	files: [...new Set(browserTests.map((test) => test.file))],
	tests: browserTests,
};

const allParityAndGuardFiles = [
	...inventory.files,
	...browserTests.map((test) => test.file),
	...guardTests.map((test) => test.file),
].sort();
const uniqueRuntimeFiles = [...new Set(allParityAndGuardFiles)];
const uniqueFiles = [...uniqueRuntimeFiles, ...typeTests].sort();

function classifyPath(path) {
	if (path === 'packages/drei/typetests/pristine/public-api.test-d.ts') {
		return {
			path,
			disposition: 'repo-authored-type-parity',
			oracle: 'Repo-authored public-surface type assertions against pinned @react-three/drei.',
		};
	}
	if (path === 'packages/drei/typetests/adapted/public-api.test-d.ts') {
		return {
			path,
			disposition: 'repo-authored-type-parity',
			oracle: 'Matching public-surface type assertions against @octanejs/drei.',
		};
	}
	if (path.includes('/typetests/')) {
		return {
			path,
			disposition: 'octane-only-framework-contract',
			reason:
				'Ordinary Octane-only type coverage executed by package typecheck; outside parity evidence lanes.',
		};
	}
	if (path.includes('/tests/browser/')) {
		return {
			path,
			disposition: 'adapted-octane-upstream-suite',
			oracle:
				'Ports the vendored Playwright gallery scene to Octane; pristine upstream execution is tracked separately.',
		};
	}
	if (isOctaneOnly(path)) {
		if (path.endsWith('/config.test.ts')) {
			return {
				path,
				disposition: 'octane-only-framework-contract',
				reason: 'Validates the Octane renderer-boundary preset, which has no React counterpart.',
			};
		}
		if (path.endsWith('/view-renderer-boundary.test.ts')) {
			return {
				path,
				disposition: 'octane-only-divergence',
				reason:
					'Pins the intentional DOM-root View renderer-boundary divergence as ordinary drei-guards evidence; it is not paired React behavioral evidence.',
				divergenceId: 'view-renderer-boundary',
			};
		}
		if (path.includes('/tests/octane-contracts/')) {
			return {
				path,
				disposition: 'octane-only-framework-contract',
				reason:
					'Octane-only compiler, provider, or lifecycle contract without a paired React scenario.',
			};
		}
		return {
			path,
			disposition: 'octane-only-framework-contract',
			reason: 'Validates repository audit machinery; it is not React behavioral evidence.',
		};
	}
	const source = readFileSync(resolve(root, path), 'utf8');
	if (!source.includes('@react-three/drei')) {
		throw new Error(`${path} needs an explicit non-differential classification`);
	}
	return {
		path,
		disposition: 'react-octane-differential',
		oracle:
			'Executes the same observable scenario against pinned @react-three/drei and @octanejs/drei in the test body.',
	};
}

const classifications = {
	schemaVersion: 1,
	tests: uniqueFiles.map(classifyPath),
};

const runtimeEvidence = {
	schemaVersion: 1,
	oracle: '@react-three/drei@10.7.7 with React 19 and @react-three/fiber@9.6.1',
	files: uniqueRuntimeFiles.map((path) => {
		const contents = readFileSync(resolve(root, path));
		const assertions = differentialTests.filter((test) => test.file === path);
		const guardAssertions = guardTests.filter((test) => test.file === path);
		const allAssertions = assertions.length > 0 ? assertions : guardAssertions;
		return {
			path,
			sha256: digest(contents),
			assertionCount: allAssertions.length,
			assertionInventorySha256: digest(allAssertions.map((test) => test.fullName).join('\n')),
		};
	}),
};

const upstreamArtifacts = {
	schemaVersion: 1,
	upstreamRuntimeSuite: 'insufficient',
	upstreamTypeSuite: 'absent',
	typeSuiteAudit: {
		searchedRoots: [
			'test',
			'tests',
			'src/__tests__',
			'src/__typetest__',
			'type-tests',
			'typetests',
		],
		result: 'No upstream type-test suite or @ts-expect-error assertion exists at the pinned tag.',
	},
	allowedTransformations: [
		{
			kind: 'import-root',
			from: '@react-three/drei',
			to: '@octanejs/drei',
			reason: 'Selects the binding under test.',
		},
		{
			kind: 'leading-comment',
			reason: 'Describes each compiler lane.',
		},
	],
	upstreamSourceExpectErrors: readdirRecursive(resolve(root, 'packages/drei/upstream/src'))
		.filter((path) => /\.[cm]?[jt]sx?$/.test(path))
		.flatMap((path) => {
			const relativePath = portable(relative(root, path));
			return readFileSync(path, 'utf8')
				.split('\n')
				.flatMap((line, index) =>
					line.includes('@ts-expect-error')
						? [{ path: relativePath, line: index + 1, sha256: digest(line.trim()) }]
						: [],
				);
		}),
	artifacts: [
		{
			path: 'packages/drei/upstream/test/e2e/App.tsx',
			disposition: 'support',
			reason:
				'Copied unchanged into the temporary Vite React application that executes the vendored Playwright test.',
		},
		{
			path: 'packages/drei/upstream/test/e2e/e2e.sh',
			disposition: 'out-of-scope',
			reason:
				'Upstream e2e shell creates temporary Vite/Next apps and runs Playwright against a packed artifact; that workflow is outside the Vitest/Jest parity execution kinds.',
		},
		{
			path: 'packages/drei/upstream/test/e2e/snapshot.test.ts',
			disposition: 'executed-pristine',
			reason:
				'Executed unchanged by the playwright-full lane against the vendored App.tsx and pinned React Drei runtime.',
		},
		{
			path: 'packages/drei/upstream/test/e2e/snapshot.test.ts-snapshots/should-match-previous-one-1-linux.png',
			disposition: 'support',
			reason: 'Vendored Linux screenshot oracle retained with the executed upstream case.',
		},
	].map((entry) => ({ ...entry, sha256: digest(readFileSync(resolve(root, entry.path))) })),
};

function readdirRecursive(directory) {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => resolve(entry.parentPath, entry.name));
}

const generatedFiles = [
	['differential-runtime.json', inventory],
	['upstream-browser.json', browserInventory],
	['test-classifications.json', classifications],
	['runtime-evidence.json', runtimeEvidence],
	['upstream-test-artifacts.json', upstreamArtifacts],
];
for (const [name, value] of generatedFiles) {
	const destination = resolve(auditRoot, name);
	mkdirSync(dirname(destination), { recursive: true });
	writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`);
	console.log(`${portable(relative(root, destination))}: generated`);
}
execFileSync(
	process.execPath,
	[
		'node_modules/prettier/bin/prettier.cjs',
		'--write',
		...generatedFiles.map(([name]) => portable(relative(root, resolve(auditRoot, name)))),
	],
	{ cwd: root, stdio: 'ignore' },
);

const manifestPath = resolve(auditRoot, 'react-parity.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const runtimeIdentities = new Set(browserTests.map((test) => `${test.file}\0${test.fullName}`));
manifest.upstreamSuites = { runtime: 'insufficient', types: 'absent' };
manifest.adaptedRoots = {
	source: {
		roots: ['packages/drei/src'],
		include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
		exclude: [],
	},
	tests: {
		roots: ['packages/drei/tests/browser'],
		include: ['\\.browser\\.test\\.ts$'],
		exclude: [],
	},
};
manifest.adaptedRuntimeSummary = {
	inventoryEntries: browserTests.length,
	uniqueIdentities: runtimeIdentities.size,
	duplicateEntriesWithinLanes: browserTests.length - runtimeIdentities.size,
	identitiesSharedAcrossLanes: 0,
};
manifest.environments['workspace-node'].lockfileSha256 = digest(
	readFileSync(resolve(root, manifest.environments['workspace-node'].lockfile)),
);

function requireDifferentialCase(needle) {
	const match = differentialTests.find((test) => test.fullName.includes(needle));
	if (!match) {
		throw new Error(`differential case missing from drei-differential project: ${needle}`);
	}
	return match;
}
function requireGuardCase(needle) {
	const match = guardTests.find((test) => test.fullName.includes(needle));
	if (!match) {
		throw new Error(`guard case missing from drei-guards project: ${needle}`);
	}
	return match;
}
const viewRenderingCase = requireDifferentialCase(
	'matches tracked rect, viewport/scissor/render restoration, frames and refs',
);
const viewVisibilityCase = requireDifferentialCase(
	'matches invisible and offscreen clear/render boundaries and event connection cleanup',
);
const viewBoundaryCase = requireGuardCase(
	'documents the outside-DOM renderer boundary while keeping View.Port callable',
);
const adaptedScreenshotCase = browserTests.find((test) =>
	test.fullName.endsWith('should match previous one'),
);
if (!adaptedScreenshotCase) {
	throw new Error('adapted screenshot case missing from drei-adapted-browser project');
}

manifest.lanes = [
	{
		id: 'drei-pristine-upstream',
		type: 'pristine-upstream',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'drei-pristine-playwright',
		evidenceOrigin: 'upstream-suite',
		notes:
			'Runs the vendored Playwright screenshot test byte-for-byte against published React Drei.',
		execution: {
			kind: 'playwright-full',
			config: 'packages/drei/scripts/pristine-playwright.json',
			root: 'packages/drei/upstream',
			inventory: 'packages/drei/audit/pristine-runtime.json',
		},
		files: [
			{
				path: 'scripts/react-parity/playwright-full-runner.mjs',
				role: 'support',
				sha256: digest(
					readFileSync(resolve(root, 'scripts/react-parity/playwright-full-runner.mjs')),
				),
			},
			{
				path: 'packages/drei/scripts/pristine-playwright.json',
				role: 'support',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/scripts/pristine-playwright.json')),
				),
			},
			{
				path: 'packages/drei/audit/pristine-runtime.json',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/audit/pristine-runtime.json'))),
			},
			{
				path: 'packages/drei/upstream/test/e2e/snapshot.test.ts',
				role: 'support',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/upstream/test/e2e/snapshot.test.ts')),
				),
			},
		],
	},
	{
		id: 'drei-adapted-upstream-e2e',
		type: 'adapted-octane',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'drei-adapted-browser',
		evidenceOrigin: 'upstream-suite',
		notes:
			'Ports the upstream gallery scene to Octane and retains its screenshot oracle as adapted evidence.',
		execution: {
			kind: 'vitest-full',
			inventory: 'packages/drei/audit/upstream-browser.json',
		},
		files: [
			{
				path: 'packages/drei/tests/browser/upstream-e2e.browser.test.ts',
				role: 'test',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/tests/browser/upstream-e2e.browser.test.ts')),
				),
				cases: [
					{
						id: 'adapted:e2e-snapshot',
						testName: 'should match previous one',
						fullName: adaptedScreenshotCase.fullName,
					},
				],
			},
			{
				path: 'packages/drei/audit/upstream-browser.json',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/audit/upstream-browser.json'))),
			},
		],
	},
	{
		id: 'drei-repo-authored-differential',
		type: 'differential',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'drei-differential',
		evidenceOrigin: 'repo-authored',
		notes:
			'Runs the paired React/Octane characterization suite (including the View canary) under the non-overlapping drei-differential project. Octane-only guards stay in drei-guards.',
		execution: {
			kind: 'vitest-full',
			inventory: 'packages/drei/audit/differential-runtime.json',
		},
		files: [
			{
				path: 'packages/drei/audit/differential-runtime.json',
				role: 'support',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/audit/differential-runtime.json')),
				),
			},
			{
				path: 'packages/drei/audit/runtime-evidence.json',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/audit/runtime-evidence.json'))),
			},
			{
				path: 'packages/drei/audit/test-classifications.json',
				role: 'support',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/audit/test-classifications.json')),
				),
			},
			{
				path: 'packages/drei/audit/upstream-test-artifacts.json',
				role: 'support',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/audit/upstream-test-artifacts.json')),
				),
			},
			{
				path: 'packages/drei/scripts/check-react-parity.mjs',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/scripts/check-react-parity.mjs'))),
			},
			{
				path: 'packages/drei/tests/differential/view.test.ts',
				role: 'test',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/tests/differential/view.test.ts')),
				),
				cases: [
					{
						id: 'differential:view-rendering',
						testName: 'matches tracked rect, viewport/scissor/render restoration, frames and refs',
						fullName: viewRenderingCase.fullName,
					},
					{
						id: 'differential:view-visibility',
						testName:
							'matches invisible and offscreen clear/render boundaries and event connection cleanup',
						fullName: viewVisibilityCase.fullName,
					},
				],
			},
		],
	},
	{
		id: 'drei-pristine-types',
		type: 'pristine-types',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'drei-pristine-types',
		evidenceOrigin: 'repo-authored',
		notes:
			'Repo-authored public-surface type assertions against pinned @react-three/drei with tsc.',
		execution: {
			kind: 'typescript',
			compiler: 'tsc',
			project: 'packages/drei/typetests/pristine/tsconfig.json',
		},
		files: [
			{
				path: 'packages/drei/typetests/pristine/public-api.test-d.ts',
				role: 'test',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/typetests/pristine/public-api.test-d.ts')),
				),
				cases: [
					{
						id: 'types:pristine',
						testName: 'public surface type assertions',
						fullName: 'public surface type assertions',
					},
				],
			},
			{
				path: 'packages/drei/typetests/assertions.md',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/typetests/assertions.md'))),
			},
		],
	},
	{
		id: 'drei-adapted-types',
		type: 'adapted-types',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'drei-adapted-types',
		evidenceOrigin: 'repo-authored',
		notes: 'The same assertion groups against @octanejs/drei with tsrx-tsc.',
		execution: {
			kind: 'typescript',
			compiler: 'tsrx-tsc',
			project: 'packages/drei/typetests/adapted/tsconfig.json',
		},
		files: [
			{
				path: 'packages/drei/typetests/adapted/public-api.test-d.ts',
				role: 'test',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/typetests/adapted/public-api.test-d.ts')),
				),
				cases: [
					{
						id: 'types:adapted',
						testName: 'public surface type assertions',
						fullName: 'public surface type assertions',
					},
				],
			},
			{
				path: 'packages/drei/typetests/assertions.md',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/typetests/assertions.md'))),
			},
		],
	},
];

const viewBoundaryPath = 'packages/drei/tests/view-renderer-boundary.test.ts';
manifest.divergences = [
	{
		id: 'view-renderer-boundary',
		caseIds: ['ordinary:view-renderer-boundary'],
		ordinaryEvidence: [
			{
				id: 'ordinary:view-renderer-boundary',
				path: viewBoundaryPath,
				sha256: digest(readFileSync(resolve(root, viewBoundaryPath))),
				testName: 'documents the outside-DOM renderer boundary while keeping View.Port callable',
				fullName: viewBoundaryCase.fullName,
			},
		],
		upstreamResult:
			'React Drei View can render from a DOM root and move authored Three children through View.Port via tunnel-rat.',
		octaneResult:
			'Calling View from an Octane DOM root fails with the universal renderer-boundary diagnostic, and View.Port is a callable no-op.',
		rationale:
			'Octane components are statically renderer-owned, so one component cannot switch between DOM and Three renderers or transport authored Three children between independent roots.',
		classification: 'renderer-boundary',
		consumerImpact:
			'DOM-rooted View usage and View.Port tunneling are unavailable; inline Canvas views remain supported.',
		migrationGuidance:
			'Keep View under an Octane Three Canvas. Do not call View.Port from a DOM tree to host Three children.',
		owner: '@octanejs/drei',
		reviewCondition:
			'Review if Octane gains cross-renderer component ownership or a supported tunnel between DOM and Three roots.',
	},
];

for (const lane of manifest.lanes) {
	for (const file of lane.files ?? []) {
		file.sha256 = digest(readFileSync(resolve(root, file.path)));
	}
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${portable(relative(root, manifestPath))}: refreshed lanes and evidence hashes`);
execFileSync(
	process.execPath,
	['node_modules/prettier/bin/prettier.cjs', '--write', portable(relative(root, manifestPath))],
	{ cwd: root, stdio: 'ignore' },
);
