#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

import { runAdaptedUpstreamSuite } from '../../../scripts/react-parity/floating-ui-adapted-runtime.mjs';
import {
	inventoryFromIdentities,
	runPristineUpstreamSuite,
} from '../../../scripts/react-parity/floating-ui-pristine-runtime.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const check = process.argv.includes('--check');

function sha256(contents) {
	return createHash('sha256').update(contents).digest('hex');
}

function fileSha256(relativePath) {
	return sha256(readFileSync(path.resolve(repoRoot, relativePath)));
}

function evidenceFile(relativePath, role = 'support', cases) {
	return {
		path: relativePath,
		role,
		sha256: fileSha256(relativePath),
		...(cases ? { cases } : {}),
	};
}

function walkFiles(relativeRoot) {
	const absoluteRoot = path.resolve(repoRoot, relativeRoot);
	return readdirSync(absoluteRoot)
		.flatMap((name) => {
			const relativePath = `${relativeRoot}/${name}`;
			return statSync(path.resolve(repoRoot, relativePath)).isDirectory()
				? walkFiles(relativePath)
				: [relativePath];
		})
		.sort();
}

function runtimeId(file, fullName) {
	return `runtime:${sha256(`${file}\0${fullName}`).slice(0, 16)}`;
}

function portable(relativePath) {
	return relativePath.split(path.sep).join('/');
}

function normalizedFile(file) {
	return file
		.replace(/^packages\/floating-ui\/upstream\/packages\//u, '')
		.replace(/^packages\/floating-ui\/tests\/upstream\//u, '')
		.replace(/^react\/test\/unit\//u, 'react/unit/')
		.replace(/^react\/test\//u, 'react/')
		.replace(/^react-dom\/test\//u, 'react-dom/');
}

function normalizedKey(test) {
	return `${normalizedFile(test.file)}\0${test.fullName}`;
}

function assertionIdentities(report, lane) {
	const pristinePrefix = /^packages\/floating-ui\/\.pristine-upstream-[^/]+\//u;
	const identities = [];
	for (const suite of report.testResults ?? []) {
		let file = portable(path.relative(repoRoot, path.resolve(suite.name)));
		if (lane === 'pristine') {
			file = file.replace(pristinePrefix, 'packages/floating-ui/upstream/');
		}
		for (const test of suite.assertionResults ?? []) {
			identities.push({
				file,
				fullName: test.fullName ?? test.title,
				status: test.status,
			});
		}
	}
	return identities.sort((left, right) =>
		`${left.file}\0${left.fullName}`.localeCompare(`${right.file}\0${right.fullName}`),
	);
}

function adaptedInventory(identities, expectedFailures) {
	const idOccurrences = new Map();
	const tests = identities
		.filter((test) => test.status === 'passed')
		.map((test) => {
			const baseId = runtimeId(test.file, test.fullName);
			const occurrence = idOccurrences.get(baseId) ?? 0;
			idOccurrences.set(baseId, occurrence + 1);
			return {
				id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
				file: test.file,
				fullName: test.fullName,
				classification: expectedFailures.has(`${test.file}\0${test.fullName}`)
					? 'expected-failure-negative-control'
					: 'compatible',
			};
		});
	return {
		schemaVersion: 1,
		project: 'floating-ui-adapted-suite',
		roots: ['packages/floating-ui/tests/upstream'],
		files: [...new Set(tests.map((test) => test.file))].sort(),
		tests,
		snapshots: 0,
		summary: {
			registered: tests.length,
			compatible: tests.filter((test) => test.classification === 'compatible').length,
			expectedFailureNegativeControls: tests.filter(
				(test) => test.classification === 'expected-failure-negative-control',
			).length,
		},
	};
}

function inventoryByNormalizedOccurrence(tests) {
	const occurrences = new Map();
	return new Map(
		tests.map((test) => {
			const baseKey = normalizedKey(test);
			const occurrence = occurrences.get(baseKey) ?? 0;
			occurrences.set(baseKey, occurrence + 1);
			return [`${baseKey}\0#${occurrence + 1}`, test];
		}),
	);
}

function wrapperInventory(project, file, fullName, id, roots = [file]) {
	return {
		schemaVersion: 1,
		project,
		roots,
		files: [file],
		tests: [{ id, file, fullName }],
		snapshots: 0,
	};
}

function adaptedWrapperInventory(cases) {
	const wrapperFile = 'packages/floating-ui/tests/adapted-original.test.ts';
	const controlsFile = 'packages/floating-ui/tests/adapted-divergences.test.ts';
	const tests = [
		{
			id: 'adapted:floating-ui-original-suite',
			file: wrapperFile,
			fullName: 'runs the adapted @floating-ui/react 0.27.19 suites on Octane',
		},
		...cases.map((entry) => ({
			id: entry.id,
			file: controlsFile,
			fullName: entry.fullName,
		})),
	].sort((left, right) => {
		const leftKey = `${left.file}\0${left.fullName}`;
		const rightKey = `${right.file}\0${right.fullName}`;
		return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
	});
	return {
		schemaVersion: 1,
		project: 'floating-ui-adapted',
		roots: ['packages/floating-ui/tests'],
		files: [controlsFile, wrapperFile],
		tests,
		snapshots: 0,
	};
}

function runTypecheck(bin, project) {
	const result = spawnSync(bin, ['--noEmit', '-p', project], {
		cwd: repoRoot,
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		throw new Error(
			`typecheck failed (${portable(path.relative(repoRoot, bin))} -p ${project})\n${result.stdout}\n${result.stderr}`,
		);
	}
}

function typeInventory({ project, compiler, files }) {
	return {
		schemaVersion: 1,
		project,
		compiler,
		files: files.map((file) => {
			const source = readFileSync(path.resolve(repoRoot, file), 'utf8');
			return {
				path: file,
				sha256: sha256(source),
				tsExpectErrorCount: (source.match(/@ts-expect-error/gu) ?? []).length,
				tsIgnoreCount: (source.match(/@ts-ignore/gu) ?? []).length,
			};
		}),
	};
}

async function emit(relativePath, data) {
	const target = path.resolve(packageRoot, relativePath);
	const serialized = await format(`${JSON.stringify(data, null, 2)}\n`, {
		...(await resolveConfig(target)),
		filepath: target,
	});
	if (check) {
		const recorded = readFileSync(target, 'utf8');
		if (recorded !== serialized) {
			throw new Error(`${portable(path.relative(repoRoot, target))} is stale`);
		}
		return;
	}
	writeFileSync(target, serialized);
}

const expectedFailureDocument = JSON.parse(
	readFileSync(path.resolve(packageRoot, 'audit/expected-failures.json'), 'utf8'),
);
const expectedFailureKeys = new Set(
	expectedFailureDocument.tests.map((test) => `${test.file}\0${test.fullName}`),
);
if (expectedFailureKeys.size !== 29) {
	throw new Error(
		`expected 29 distinct adapted negative controls, got ${expectedFailureKeys.size}`,
	);
}

const adaptedSource = expectedFailureDocument.tests
	.map((test) => test.file)
	.filter((file, index, files) => files.indexOf(file) === index)
	.map((file) => readFileSync(path.resolve(repoRoot, file), 'utf8'))
	.join('\n');
const failsModifiers = adaptedSource.match(/\b(?:it|test)\.fails\s*\(/gu) ?? [];
if (failsModifiers.length !== expectedFailureKeys.size) {
	throw new Error(
		`expected ${expectedFailureKeys.size} test.fails/it.fails negative controls, found ${failsModifiers.length}`,
	);
}

const pristineResult = runPristineUpstreamSuite({ repoRoot });
if (pristineResult.status !== 0) {
	throw new Error(`pristine runtime failed\n${pristineResult.stdout}\n${pristineResult.stderr}`);
}
const adaptedResult = runAdaptedUpstreamSuite({ repoRoot });
if (adaptedResult.status !== 0) {
	throw new Error(`adapted runtime failed\n${adaptedResult.stdout}\n${adaptedResult.stderr}`);
}

const pristineAll = assertionIdentities(pristineResult.report, 'pristine');
const adaptedAll = assertionIdentities(adaptedResult.report, 'adapted');
const pristinePassed = pristineAll.filter((test) => test.status === 'passed');
const adaptedPassed = adaptedAll.filter((test) => test.status === 'passed');
const pristineSkipped = pristineAll.filter((test) =>
	['pending', 'skipped', 'todo'].includes(test.status),
);
const adaptedSkipped = adaptedAll.filter((test) =>
	['pending', 'skipped', 'todo'].includes(test.status),
);

if (pristinePassed.length !== 301 || adaptedPassed.length !== 301) {
	throw new Error(
		`expected 301 registered passes per lane, got pristine=${pristinePassed.length} adapted=${adaptedPassed.length}`,
	);
}
if (pristineSkipped.length !== 6 || adaptedSkipped.length !== 6) {
	throw new Error(
		`expected six upstream skips per lane, got pristine=${pristineSkipped.length} adapted=${adaptedSkipped.length}`,
	);
}

const pristineInventory = inventoryFromIdentities(pristineResult.identities);
const adaptedRuntimeInventory = adaptedInventory(adaptedResult.identities, expectedFailureKeys);
const pristineByKey = inventoryByNormalizedOccurrence(pristineInventory.tests);
const adaptedByKey = inventoryByNormalizedOccurrence(adaptedRuntimeInventory.tests);
const missingAdapted = [...pristineByKey.keys()].filter((key) => !adaptedByKey.has(key));
const unexpectedAdapted = [...adaptedByKey.keys()].filter((key) => !pristineByKey.has(key));
if (missingAdapted.length || unexpectedAdapted.length) {
	throw new Error(
		`runtime crosswalk mismatch\nmissing adapted:\n${missingAdapted.join('\n')}\nunexpected adapted:\n${unexpectedAdapted.join('\n')}`,
	);
}
for (const key of expectedFailureKeys) {
	const adapted = adaptedRuntimeInventory.tests.find(
		(test) => `${test.file}\0${test.fullName}` === key,
	);
	if (!adapted || adapted.classification !== 'expected-failure-negative-control') {
		throw new Error(`adapted negative control missing from executable inventory: ${key}`);
	}
}

const expectedByKey = new Map(
	expectedFailureDocument.tests.map((test) => [`${test.file}\0${test.fullName}`, test]),
);
const runtimeCrosswalk = {
	schemaVersion: 1,
	pristineInventory: 'packages/floating-ui/audit/pristine-runtime.json',
	adaptedInventory: 'packages/floating-ui/audit/adapted-runtime.json',
	summary: {
		crosswalked: pristineInventory.tests.length,
		compatible: adaptedRuntimeInventory.summary.compatible,
		expectedFailureNegativeControls:
			adaptedRuntimeInventory.summary.expectedFailureNegativeControls,
	},
	tests: [...pristineByKey.entries()].map(([key, pristine]) => {
		const adapted = adaptedByKey.get(key);
		const expected = expectedByKey.get(`${adapted.file}\0${adapted.fullName}`);
		return {
			id: `crosswalk:${sha256(key).slice(0, 16)}`,
			normalizedFile: normalizedFile(pristine.file),
			fullName: pristine.fullName,
			pristineId: pristine.id,
			adaptedId: adapted.id,
			disposition: expected ? 'expected-failure-negative-control' : 'compatible',
			...(expected ? { divergenceId: expected.divergenceId, divergenceCaseId: expected.id } : {}),
		};
	}),
};
const crosswalkDispositionCounts = runtimeCrosswalk.tests.reduce((counts, test) => {
	counts[test.disposition] = (counts[test.disposition] ?? 0) + 1;
	return counts;
}, {});
if (
	runtimeCrosswalk.tests.length !== runtimeCrosswalk.summary.crosswalked ||
	(crosswalkDispositionCounts.compatible ?? 0) !== runtimeCrosswalk.summary.compatible ||
	(crosswalkDispositionCounts['expected-failure-negative-control'] ?? 0) !==
		runtimeCrosswalk.summary.expectedFailureNegativeControls
) {
	throw new Error(
		`runtime crosswalk summary mismatch: declared=${JSON.stringify(runtimeCrosswalk.summary)} actual=${JSON.stringify(crosswalkDispositionCounts)} total=${runtimeCrosswalk.tests.length}`,
	);
}

const pristineSkippedByKey = new Map(pristineSkipped.map((test) => [normalizedKey(test), test]));
const adaptedSkippedByKey = new Map(adaptedSkipped.map((test) => [normalizedKey(test), test]));
if (
	pristineSkippedByKey.size !== adaptedSkippedByKey.size ||
	[...pristineSkippedByKey.keys()].some((key) => !adaptedSkippedByKey.has(key))
) {
	throw new Error('pristine/adapted upstream skip identities differ');
}
const upstreamSkips = {
	schemaVersion: 1,
	disposition: 'upstream-declared-skip-non-evidence',
	tests: [...pristineSkippedByKey.entries()].map(([key, pristine]) => ({
		id: `skip:${sha256(key).slice(0, 16)}`,
		normalizedFile: normalizedFile(pristine.file),
		fullName: pristine.fullName,
		pristineFile: pristine.file,
		adaptedFile: adaptedSkippedByKey.get(key).file,
	})),
};

const pristineTypeFiles = [
	'packages/floating-ui/upstream/packages/react/test/index.test-d.tsx',
	'packages/floating-ui/upstream/packages/react-dom/test/index.test-d.tsx',
];
const adaptedTypeFiles = [
	'packages/floating-ui/tests/upstream/react/index.test-d.tsx',
	'packages/floating-ui/tests/upstream/react-dom/index.test-d.tsx',
];
runTypecheck(
	path.resolve(packageRoot, 'node_modules/.bin/tsc'),
	'packages/floating-ui/typetests/tsconfig.pristine.json',
);
runTypecheck(
	path.resolve(repoRoot, 'node_modules/.bin/tsrx-tsc'),
	'packages/floating-ui/typetests/tsconfig.adapted.json',
);
const pristineTypes = typeInventory({
	project: 'floating-ui-pristine-types',
	compiler: 'typescript@5.4.2',
	files: pristineTypeFiles,
});
const adaptedTypes = typeInventory({
	project: 'floating-ui-adapted-types',
	compiler: 'tsrx-tsc',
	files: adaptedTypeFiles,
});
const typeParity = {
	schemaVersion: 1,
	pristineInventory: 'packages/floating-ui/audit/pristine-types.json',
	adaptedInventory: 'packages/floating-ui/audit/adapted-types.json',
	lanes: {
		pristine: {
			compiler: 'typescript@5.4.2',
			project: 'packages/floating-ui/typetests/tsconfig.pristine.json',
		},
		adapted: {
			compiler: 'tsrx-tsc',
			project: 'packages/floating-ui/typetests/tsconfig.adapted.json',
		},
	},
	mappings: pristineTypeFiles.map((pristine, index) => ({
		pristine,
		adapted: adaptedTypeFiles[index],
		pristineSha256: fileSha256(pristine),
		adaptedSha256: fileSha256(adaptedTypeFiles[index]),
	})),
	permittedTransformations: [
		'React imports and JSX runtime become Octane imports and JSX runtime.',
		'Relative upstream package imports become the @octanejs/floating-ui source entry point.',
		'React forwardRef/ref-channel types become Octane ref-as-prop types.',
		'Octane useRef includes null explicitly in the generic argument.',
		'The combined Octane package records the @floating-ui/react-dom-only reference narrowing as an expected type divergence.',
	],
};

const ordinaryClassifications = [
	{
		path: 'packages/floating-ui/tests/browser/positioning.browser.test.ts',
		disposition: 'octane-only-framework-contract',
		reason:
			'Real-Chromium positioning and autoUpdate observation for the Octane binding; supplemental environment evidence, not an upstream-suite identity.',
	},
	{
		path: 'packages/floating-ui/tests/components.test.ts',
		disposition: 'octane-only-framework-contract',
		reason:
			'Port-authored component, portal, focus, composite, and transition coverage under Octane.',
	},
	{
		path: 'packages/floating-ui/tests/differential/parity.test.ts',
		disposition: 'react-octane-differential',
		oracle:
			'Runs the TwoTooltips fixture against pinned @floating-ui/react@0.27.19 and @octanejs/floating-ui.',
	},
	{
		path: 'packages/floating-ui/tests/differential/setup.test.ts',
		disposition: 'octane-only-framework-contract',
		reason: 'Fail-closed setup coverage for the exact declared differential fixture.',
	},
	{
		path: 'packages/floating-ui/tests/positioning.test.ts',
		disposition: 'octane-only-framework-contract',
		reason: 'Port-authored positioning and interaction contracts under Octane scheduling.',
	},
	{
		path: 'packages/floating-ui/tests/package-boundary.test.ts',
		disposition: 'octane-only-framework-contract',
		reason: 'Published package metadata and tree-shaking boundary coverage.',
	},
	{
		path: 'packages/floating-ui/tests/upstream-original.test.ts',
		disposition: 'unmodified-upstream-suite-wrapper',
		oracle:
			'Runs the lock-pinned byte-exact React and React-DOM suites and checks all 301 passed identities.',
	},
	{
		path: 'packages/floating-ui/typetests/public-api.test-d.ts',
		disposition: 'octane-only-type-conformance',
		reason:
			'Port-authored Octane public API probes that predate the one-for-one upstream declaration programs; supplemental type conformance, not upstream-suite identity evidence.',
	},
	{
		path: 'packages/floating-ui/tests/adapted-divergences.test.ts',
		disposition: 'adapted-upstream-suite',
		oracle:
			'Fail-closed executable controls bind every disclosed adapted negative control to its source and one-for-one runtime crosswalk entry.',
	},
	{
		path: 'packages/floating-ui/tests/adapted-original.test.ts',
		disposition: 'adapted-upstream-suite',
		oracle:
			'Runs the one-for-one adapted suite with the pinned Vitest 3.0.9 toolchain and checks all 301 registered identities.',
	},
];
const testClassifications = {
	schemaVersion: 1,
	tests: ordinaryClassifications.sort((left, right) => left.path.localeCompare(right.path)),
};

const expectedFailureCases = expectedFailureDocument.tests.map((test) => ({
	id: test.id,
	testName: `locks ${test.id}`,
	fullName: `locks ${test.id}`,
}));

await emit('audit/pristine-runtime.json', {
	...pristineInventory,
	summary: { passed: pristineInventory.tests.length, upstreamSkips: pristineSkipped.length },
});
await emit('audit/adapted-runtime.json', adaptedRuntimeInventory);
await emit('audit/runtime-crosswalk.json', runtimeCrosswalk);
await emit('audit/upstream-skips.json', upstreamSkips);
await emit(
	'audit/pristine-wrapper-runtime.json',
	wrapperInventory(
		'floating-ui-pristine',
		'packages/floating-ui/tests/upstream-original.test.ts',
		'runs the pinned @floating-ui/react 0.27.19 suites unchanged',
		'pristine:floating-ui-original-suite',
	),
);
await emit('audit/adapted-wrapper-runtime.json', adaptedWrapperInventory(expectedFailureCases));
await emit('audit/pristine-types.json', pristineTypes);
await emit('audit/adapted-types.json', adaptedTypes);
await emit('audit/type-parity.json', typeParity);
await emit('audit/test-classifications.json', testClassifications);

const pristineTypeCases = [
	{
		id: 'types:floating-ui-pristine-react',
		testName: '@floating-ui/react declaration program',
		fullName: '@floating-ui/react declaration program',
	},
	{
		id: 'types:floating-ui-pristine-react-dom',
		testName: '@floating-ui/react-dom declaration program',
		fullName: '@floating-ui/react-dom declaration program',
	},
];
const adaptedTypeCases = [
	{
		id: 'types:floating-ui-adapted-react',
		testName: '@octanejs/floating-ui adapted React declaration program',
		fullName: '@octanejs/floating-ui adapted React declaration program',
	},
	{
		id: 'types:floating-ui-adapted-react-dom',
		testName: '@octanejs/floating-ui adapted React-DOM declaration program',
		fullName: '@octanejs/floating-ui adapted React-DOM declaration program',
	},
];
const casesForDivergence = (divergenceId) =>
	expectedFailureDocument.tests
		.filter((test) => test.divergenceId === divergenceId)
		.map((test) => test.id);
const upstreamLock = JSON.parse(
	readFileSync(path.resolve(packageRoot, 'audit/upstream.lock.json'), 'utf8'),
);
const manifest = {
	$schema: '../../hook-form/audit/react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/floating-ui/floating-ui.git',
		version: '@floating-ui/react@0.27.19',
		commit: 'd8020ee98c702caa31fa9b4d929ca782c6b58c59',
		sourceRoot: 'packages/core; packages/dom; packages/react; packages/react-dom; packages/utils',
		testRoot: 'packages/react/test; packages/react-dom/test',
		license: 'MIT',
		integrity: `sha256:${upstreamLock.fingerprint}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'present' },
	adaptedRoots: {
		source: {
			roots: ['packages/floating-ui/src'],
			include: ['\\.ts$'],
			exclude: [],
		},
		tests: {
			roots: ['packages/floating-ui/tests'],
			include: ['adapted-(?:divergences|original)\\.test\\.ts$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: {
		inventoryEntries: 30,
		uniqueIdentities: 30,
		duplicateEntriesWithinLanes: 0,
		identitiesSharedAcrossLanes: 0,
	},
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@11.15.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: fileSha256('pnpm-lock.yaml'),
		},
	},
	lanes: [
		{
			id: 'floating-ui-pristine-runtime',
			type: 'pristine-upstream',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'floating-ui-pristine',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Runs the lock-pinned byte-exact React/React-DOM suites with upstream Vitest 3.0.9-era dependencies; 301 assertions pass and six upstream skips remain non-evidence.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/floating-ui/audit/pristine-wrapper-runtime.json',
			},
			files: [
				evidenceFile('packages/floating-ui/audit/pristine-wrapper-runtime.json'),
				evidenceFile('packages/floating-ui/audit/pristine-runtime.json'),
				evidenceFile('packages/floating-ui/audit/upstream-skips.json'),
				evidenceFile('packages/floating-ui/tests/upstream-original.test.ts'),
				evidenceFile('packages/floating-ui/tests/upstream-vitest.config.ts'),
				evidenceFile('packages/floating-ui/audit/pristine-suite.json'),
				evidenceFile('packages/floating-ui/audit/upstream.lock.json'),
				evidenceFile('scripts/react-parity/floating-ui-pristine-runtime.mjs'),
			],
		},
		{
			id: 'floating-ui-adapted-runtime',
			type: 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'floating-ui-adapted',
			evidenceOrigin: 'upstream-suite',
			notes:
				'One-for-one adapted suite on the same Vitest 3.0.9 runner: 272 compatible passes plus 29 executable expected-failure negative controls, crosswalked to every pristine executed identity.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/floating-ui/audit/adapted-wrapper-runtime.json',
			},
			files: [
				evidenceFile('packages/floating-ui/audit/adapted-wrapper-runtime.json'),
				evidenceFile('packages/floating-ui/audit/adapted-runtime.json'),
				evidenceFile('packages/floating-ui/audit/runtime-crosswalk.json'),
				evidenceFile('packages/floating-ui/audit/expected-failures.json', 'support'),
				evidenceFile('packages/floating-ui/audit/upstream-skips.json'),
				evidenceFile('packages/floating-ui/tests/adapted-original.test.ts'),
				evidenceFile(
					'packages/floating-ui/tests/adapted-divergences.test.ts',
					'test',
					expectedFailureCases,
				),
				evidenceFile('packages/floating-ui/tests/adapted-vitest.config.ts'),
				evidenceFile('packages/floating-ui/audit/upstream.lock.json'),
				evidenceFile('scripts/react-parity/floating-ui-adapted-runtime.mjs'),
				evidenceFile('packages/floating-ui/scripts/generate-parity-evidence.mjs'),
				...walkFiles('packages/floating-ui/audit/upstream-patches').map((file) =>
					evidenceFile(file),
				),
			],
		},
		{
			id: 'floating-ui-pristine-types',
			type: 'pristine-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'floating-ui-pristine-types',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Compiles both byte-exact upstream index.test-d.tsx programs with TypeScript 5.4.2 and the exact React 18 declaration versions from the pinned lock.',
			execution: {
				kind: 'typescript',
				compiler: 'tsc',
				compilerBins: ['packages/floating-ui/node_modules/typescript/bin/tsc'],
				project: 'packages/floating-ui/typetests/tsconfig.pristine.json',
			},
			files: [
				evidenceFile('packages/floating-ui/audit/pristine-types.json', 'test', pristineTypeCases),
				evidenceFile('packages/floating-ui/audit/type-parity.json'),
				evidenceFile('packages/floating-ui/typetests/tsconfig.pristine.json'),
				evidenceFile('packages/floating-ui/typetests/upstream-globals.d.ts'),
				evidenceFile('packages/floating-ui/audit/upstream.lock.json'),
			],
		},
		{
			id: 'floating-ui-adapted-types',
			type: 'adapted-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'floating-ui-adapted-types',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Compiles the one-for-one adapted declaration programs with tsrx-tsc and explicit negative controls/permitted transformation records.',
			execution: {
				kind: 'typescript',
				compiler: 'tsrx-tsc',
				project: 'packages/floating-ui/typetests/tsconfig.adapted.json',
			},
			files: [
				evidenceFile('packages/floating-ui/audit/adapted-types.json', 'test', adaptedTypeCases),
				evidenceFile('packages/floating-ui/audit/type-parity.json'),
				evidenceFile('packages/floating-ui/typetests/tsconfig.adapted.json'),
				evidenceFile(
					'packages/floating-ui/audit/upstream-patches/tests/upstream/react/index.test-d.tsx.patch',
				),
				evidenceFile(
					'packages/floating-ui/audit/upstream-patches/tests/upstream/react-dom/index.test-d.tsx.patch',
				),
			],
		},
		{
			id: 'floating-ui-runtime-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'floating-ui-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'Compiles the exact declared TwoTooltips fixture for both adapters and compares independent hook placement output.',
			files: [
				evidenceFile('packages/floating-ui/tests/differential/parity.test.ts', 'test', [
					{
						id: 'differential:floating-ui-hook-isolation',
						testName: 'keeps independent useFloating placements byte-identical',
						fullName:
							'differential: @octanejs/floating-ui vs @floating-ui/react keeps independent useFloating placements byte-identical',
					},
				]),
				evidenceFile('packages/floating-ui/tests/differential/_setup.ts'),
				evidenceFile('packages/floating-ui/tests/differential/fixtures.ts'),
				evidenceFile('packages/floating-ui/tests/differential/fixture-compiler.mjs'),
				evidenceFile('packages/floating-ui/tests/differential/compile-runner.mjs'),
				evidenceFile('packages/floating-ui/tests/_fixtures/tooltip.tsx'),
			],
		},
		{
			id: 'floating-ui-real-browser',
			type: 'browser',
			oracle: 'optional',
			environment: 'workspace-node',
			project: 'floating-ui-browser',
			notes:
				'Real-Chromium positioning and ResizeObserver/autoUpdate coverage; supplemental to the jsdom upstream oracle.',
			files: [
				evidenceFile('packages/floating-ui/tests/browser/positioning.browser.test.ts', 'test', [
					{
						id: 'browser:floating-ui-real-layout',
						testName: 'uses real layout geometry and auto-updates after the reference moves',
						fullName:
							'@octanejs/floating-ui real-browser positioning uses real layout geometry and auto-updates after the reference moves',
					},
				]),
			],
		},
	],
	divergences: [
		{
			id: 'floating-ui-ref-as-prop',
			caseIds: ['types:floating-ui-adapted-react'],
			upstreamResult: 'Custom React components receive forwarded refs through React.forwardRef.',
			octaneResult: 'Custom Octane components receive ref as an ordinary prop.',
			rationale: 'Octane has a native ref-as-prop contract and no forwardRef wrapper.',
			classification: 'framework-integration',
			consumerImpact:
				'Component implementations accept ref in their props instead of using forwardRef.',
			migrationGuidance: 'Accept and forward the ref prop directly.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review if Octane adopts a distinct ref-forwarding primitive.',
		},
		{
			id: 'floating-ui-ref-scheduling',
			caseIds: casesForDivergence('floating-ui-ref-scheduling'),
			upstreamResult:
				'Callback-ref swaps, middleware freshness, and element cleanup follow React commit timing.',
			octaneResult: 'The same scenarios currently fail under Octane ref/effect scheduling.',
			rationale:
				'These cases remain executable expected-failure controls rather than compatibility claims.',
			classification: 'known-behavior-gap',
			consumerImpact:
				'Rapid ref replacement or cleanup may be observed at a different point in the update.',
			migrationGuidance:
				'Keep callback refs stable and avoid depending on React-specific detach timing.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Remove each case only when it passes without the fails modifier.',
		},
		{
			id: 'floating-ui-focus-scheduling',
			caseIds: casesForDivergence('floating-ui-focus-scheduling'),
			upstreamResult:
				'Return-focus, aria-hiding, and non-modal tab order match React commit/focus timing.',
			octaneResult: 'Two focus-order assertions remain expected failures.',
			rationale: 'Octane native focus/event scheduling differs in these bounded paths.',
			classification: 'known-behavior-gap',
			consumerImpact:
				'Complex non-modal or nested focus restoration can choose a different target/order.',
			migrationGuidance: 'Provide explicit initial/return focus for affected composite flows.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review when Octane focus scheduling or FloatingFocusManager changes.',
		},
		{
			id: 'floating-ui-effect-scheduling',
			caseIds: casesForDivergence('floating-ui-effect-scheduling'),
			upstreamResult: 'Listener cleanup and index-ref reset occur at React effect timing.',
			octaneResult: 'Two cleanup/reset timing assertions remain expected failures.',
			rationale: 'Octane effects have a different scheduling boundary.',
			classification: 'known-behavior-gap',
			consumerImpact:
				'A listener or navigation index may remain observable until the Octane cleanup boundary.',
			migrationGuidance:
				'Do not synchronously inspect cleanup-only state immediately after closing.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review when Octane effect cleanup timing changes.',
		},
		{
			id: 'floating-ui-iframe-realm',
			caseIds: casesForDivergence('floating-ui-iframe-realm'),
			upstreamResult: 'Forward and reverse tab navigation crosses the tested iframe realm.',
			octaneResult: 'The two iframe focus-navigation assertions remain expected failures.',
			rationale: 'Cross-realm element/focus handling is not yet equivalent.',
			classification: 'known-behavior-gap',
			consumerImpact:
				'Popover focus navigation embedded in an iframe may not choose the adjacent iframe element.',
			migrationGuidance: 'Handle cross-iframe focus transfer explicitly.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review when cross-realm focus helpers change.',
		},
		{
			id: 'floating-ui-dynamic-children',
			caseIds: casesForDivergence('floating-ui-dynamic-children'),
			upstreamResult:
				'Nested/dynamic menu children register and restore focus with React child lifecycle timing.',
			octaneResult: 'Twelve nested-navigation/typeahead assertions remain expected failures.',
			rationale:
				'Dynamic child registration and focus ownership are not yet equivalent in these nested fixtures.',
			classification: 'known-behavior-gap',
			consumerImpact:
				'Complex nested menus may differ for hover-close, Home/End, submenu, or domReference behavior.',
			migrationGuidance:
				'Keep nested item lists stable and test the required keyboard/focus path under Octane.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review when dynamic child registration or nested navigation changes.',
		},
		{
			id: 'floating-ui-react-context-fixture',
			caseIds: casesForDivergence('floating-ui-react-context-fixture'),
			upstreamResult: 'Three Drawer cases execute through React-only third-party context fixtures.',
			octaneResult:
				'The mechanically adapted fixtures cannot reproduce that React context integration.',
			rationale:
				'The dependency fixture is React-specific and remains an explicit test-environment boundary.',
			classification: 'fixture-integration',
			consumerImpact:
				'React-only context components cannot be embedded directly in Octane drawers.',
			migrationGuidance: 'Use an Octane-native equivalent for third-party context components.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review if the fixture dependencies ship Octane-compatible entry points.',
		},
		{
			id: 'floating-ui-render-count',
			caseIds: casesForDivergence('floating-ui-render-count'),
			upstreamResult: 'An unrelated NextFloatingDelayGroup consumer does not re-render.',
			octaneResult: 'The exact render-count assertion remains an expected failure.',
			rationale: 'Octane context propagation has a different render-count contract in this path.',
			classification: 'performance-semantics',
			consumerImpact: 'An unrelated delay-group consumer can render more often.',
			migrationGuidance: 'Avoid depending on exact React render counts for correctness.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review when Octane context invalidation changes.',
		},
		{
			id: 'floating-ui-list-registration',
			caseIds: casesForDivergence('floating-ui-list-registration'),
			upstreamResult: 'Grid navigation immediately incorporates changing and disabled item lists.',
			octaneResult: 'Two dynamic grid registration assertions remain expected failures.',
			rationale: 'List registration timing is not equivalent for these dynamic grid mutations.',
			classification: 'known-behavior-gap',
			consumerImpact:
				'Changing/disabled grid items may require another update before navigation matches the list.',
			migrationGuidance:
				'Keep grid item registration stable during an active navigation interaction.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review when FloatingList registration timing changes.',
		},
		{
			id: 'floating-ui-type-entrypoint',
			caseIds: ['types:floating-ui-adapted-react-dom'],
			upstreamResult:
				'@floating-ui/react-dom exposes its narrower positioning-only ref and middleware element types.',
			octaneResult:
				'The combined @octanejs/floating-ui entry point exposes interaction-ref unions in those probes.',
			rationale: 'The legacy binding combines the upstream React and React-DOM entry points.',
			classification: 'type-surface',
			consumerImpact: 'Some positioning-only reference narrowing needs an explicit element guard.',
			migrationGuidance: 'Narrow ReferenceType to Element before calling DOM-only methods.',
			owner: '@octanejs/floating-ui',
			reviewCondition: 'Review if the binding publishes a separate React-DOM-shaped entry point.',
		},
	],
};
await emit('audit/react-parity.json', manifest);

console.log(
	`floating-ui parity evidence ${check ? 'verified' : 'generated'}: ` +
		`${pristineInventory.tests.length} pristine passes, ` +
		`${adaptedRuntimeInventory.summary.compatible} compatible adapted cases, ` +
		`${adaptedRuntimeInventory.summary.expectedFailureNegativeControls} expected-failure negative controls, ` +
		`${upstreamSkips.tests.length} upstream skips`,
);
