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

const OCTANE_ONLY = new Set([
	'packages/drei/tests/config.test.ts',
	'packages/drei/tests/crosswalk-guard.test.ts',
	'packages/drei/tests/react-parity-guard.test.ts',
]);

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

const adaptedTests = withIds(listProject('drei'));
const differentialTests = withIds(listProject('drei-differential'));
const guardTests = listProject('drei-guards');

const inventory = {
	schemaVersion: 1,
	project: 'drei',
	roots: ['packages/drei/tests'],
	files: [...new Set(adaptedTests.map((test) => test.file))],
	tests: adaptedTests,
};

const allParityAndGuardFiles = [
	...inventory.files,
	...differentialTests.map((test) => test.file),
	...guardTests.map((test) => test.file),
].sort();
const uniqueFiles = [...new Set(allParityAndGuardFiles)];

const classifications = {
	schemaVersion: 1,
	tests: uniqueFiles.map((path) => {
		if (OCTANE_ONLY.has(path)) {
			if (path.endsWith('/config.test.ts')) {
				return {
					path,
					disposition: 'octane-only-framework-contract',
					reason: 'Validates the Octane renderer-boundary preset, which has no React counterpart.',
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
	}),
};

const runtimeEvidence = {
	schemaVersion: 1,
	oracle: '@react-three/drei@10.7.7 with React 19 and @react-three/fiber@9.6.1',
	files: uniqueFiles.map((path) => {
		const contents = readFileSync(resolve(root, path));
		const assertions = [...adaptedTests, ...differentialTests].filter((test) => test.file === path);
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
	upstreamRuntimeSuite: 'absent',
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
	allowedTransformations: [],
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
			disposition: 'out-of-scope',
			reason:
				'Whole-gallery Playwright fixture retained as pin evidence; excluded from Vitest/Jest parity execution because the upstream runner packs a release tarball and boots Vite/Next apps outside the repository harness.',
		},
		{
			path: 'packages/drei/upstream/test/e2e/e2e.sh',
			disposition: 'out-of-scope',
			reason:
				'Upstream e2e shell creates temporary Vite/Next apps and runs Playwright against a packed artifact; that workflow is outside the Vitest/Jest parity execution kinds.',
		},
		{
			path: 'packages/drei/upstream/test/e2e/snapshot.test.ts',
			disposition: 'out-of-scope',
			reason:
				'Sole upstream runtime case is a whole-gallery screenshot. Recorded out of scope for export-level Vitest parity; repo-authored differential tests cover export behavior.',
		},
		{
			path: 'packages/drei/upstream/test/e2e/snapshot.test.ts-snapshots/should-match-previous-one-1-linux.png',
			disposition: 'out-of-scope',
			reason: 'Screenshot oracle for the out-of-scope Playwright gallery case.',
		},
	].map((entry) => ({ ...entry, sha256: digest(readFileSync(resolve(root, entry.path))) })),
};

function readdirRecursive(directory) {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => resolve(entry.parentPath, entry.name));
}

const generatedFiles = [
	['adapted-runtime.json', inventory],
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
const runtimeIdentities = new Set(adaptedTests.map((test) => `${test.file}\0${test.fullName}`));
manifest.upstreamSuites = { runtime: 'absent', types: 'absent' };
manifest.adaptedRoots = {
	source: {
		roots: ['packages/drei/src'],
		include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
		exclude: [],
	},
	tests: {
		roots: ['packages/drei/tests'],
		include: ['\\.test\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
		exclude: [
			'tests/config\\.test\\.ts$',
			'tests/crosswalk-guard\\.test\\.ts$',
			'tests/react-parity-guard\\.test\\.ts$',
			'tests/differential/',
		],
	},
};
manifest.adaptedRuntimeSummary = {
	inventoryEntries: adaptedTests.length,
	uniqueIdentities: runtimeIdentities.size,
	duplicateEntriesWithinLanes: adaptedTests.length - runtimeIdentities.size,
	identitiesSharedAcrossLanes: 0,
};
manifest.environments['workspace-node'].lockfileSha256 = digest(
	readFileSync(resolve(root, manifest.environments['workspace-node'].lockfile)),
);

const differentialCases = [
	{
		id: 'differential:view-rendering',
		match: 'matches tracked rect, viewport/scissor/render restoration, frames and refs',
	},
	{
		id: 'differential:view-visibility',
		match: 'matches invisible and offscreen clear/render boundaries and event connection cleanup',
	},
	{
		id: 'differential:view-port-surface',
		match: 'preserves the View.Port static surface',
	},
	{
		id: 'differential:view-renderer-boundary',
		match: 'documents the outside-DOM renderer boundary while keeping View.Port callable',
	},
].map(function toCase(entry) {
	const test = differentialTests.find(function findTest(candidate) {
		return candidate.fullName.includes(entry.match);
	});
	if (!test) throw new Error(`differential canary case missing: ${entry.match}`);
	return {
		id: entry.id,
		testName: entry.match,
		fullName: test.fullName,
	};
});

manifest.lanes = [
	{
		id: 'drei-repo-authored-full-suite',
		type: 'adapted-octane',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'drei',
		evidenceOrigin: 'repo-authored',
		notes:
			'Runs the 100 paired React/Octane characterization files. Octane-only guards stay in drei-guards; the View canary lives in drei-differential.',
		execution: {
			kind: 'vitest-full',
			inventory: 'packages/drei/audit/adapted-runtime.json',
		},
		files: [
			{
				path: 'packages/drei/audit/adapted-runtime.json',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/audit/adapted-runtime.json'))),
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
				path: 'scripts/react-parity/drei-parity-lib.mjs',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'scripts/react-parity/drei-parity-lib.mjs'))),
			},
		],
	},
	{
		id: 'drei-differential-canary',
		type: 'differential',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'drei-differential',
		evidenceOrigin: 'repo-authored',
		notes:
			'Isolated View canary proving paired React/Octane Three-renderer selection outside the full adapted suite.',
		files: [
			{
				path: 'packages/drei/tests/differential/view.test.ts',
				role: 'test',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/tests/differential/view.test.ts')),
				),
				cases: differentialCases,
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
			'Repo-authored public-surface type assertions against pinned @react-three/drei with tsc. Group hashes and import-root structural comparison are enforced by scripts/react-parity/drei-types-lib.mjs.',
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
				path: 'packages/drei/typetests/pristine/tsconfig.json',
				role: 'support',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/typetests/pristine/tsconfig.json')),
				),
			},
			{
				path: 'packages/drei/audit/type-parity.json',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/audit/type-parity.json'))),
			},
			{
				path: 'packages/drei/audit/pristine-types.json',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/audit/pristine-types.json'))),
			},
			{
				path: 'scripts/react-parity/drei-types-lib.mjs',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'scripts/react-parity/drei-types-lib.mjs'))),
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
		notes:
			'The same assertion groups against @octanejs/drei with tsrx-tsc. Fail-closed against deleted assertions and non-import-root edits via drei-types-lib.',
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
				path: 'packages/drei/typetests/adapted/tsconfig.json',
				role: 'support',
				sha256: digest(
					readFileSync(resolve(root, 'packages/drei/typetests/adapted/tsconfig.json')),
				),
			},
			{
				path: 'packages/drei/audit/adapted-types.json',
				role: 'support',
				sha256: digest(readFileSync(resolve(root, 'packages/drei/audit/adapted-types.json'))),
			},
		],
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
