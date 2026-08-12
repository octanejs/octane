#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const override = process.env.OCTANE_DREI_PARITY_AUDIT;
const audit = override ? resolve(override) : resolve(root, 'packages/drei/audit');
const typeRoot = process.env.OCTANE_DREI_PARITY_TYPE_ROOT
	? resolve(process.env.OCTANE_DREI_PARITY_TYPE_ROOT)
	: resolve(root, 'packages/drei/typetests');
const read = (name) => JSON.parse(readFileSync(resolve(audit, name), 'utf8'));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const portable = (value) => value.replaceAll('\\', '/');
const fail = (message) => {
	throw new Error(`Drei React-parity audit: ${message}`);
};

const OCTANE_ONLY_GUARDS = new Set([
	'packages/drei/tests/config.test.ts',
	'packages/drei/tests/crosswalk-guard.test.ts',
	'packages/drei/tests/react-parity-guard.test.ts',
	'packages/drei/tests/view-renderer-boundary.test.ts',
]);
const isOctaneOnly = (path) =>
	OCTANE_ONLY_GUARDS.has(path) || path.includes('/tests/octane-contracts/');

function typeAssertionGroups(source) {
	return [...source.matchAll(/^\/\/ Assertion group (\d+): (.+)$/gm)].map((match) =>
		match.slice(1),
	);
}

function normalizedTypeAssertions(source) {
	return source
		.replace(/^\/\/ (?:Pristine|Adapted) side:.*\n/, '')
		.replaceAll('@react-three/drei', '@octanejs/drei');
}

const inventory = read('differential-runtime.json');
const evidence = read('runtime-evidence.json');
const classifications = read('test-classifications.json');
const upstream = read('upstream-test-artifacts.json');
const manifest = read('react-parity.json');

const discoveredRuntime = readdirSync(resolve(root, 'packages/drei/tests'), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile() && /\.test\.(?:ts|tsx|tsrx)$/.test(entry.name))
	.map((entry) => portable(relative(root, resolve(entry.parentPath, entry.name))))
	.sort();
const discoveredTypes = readdirSync(resolve(root, 'packages/drei/typetests'), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile() && entry.name.endsWith('.test-d.ts'))
	.map((entry) => portable(relative(root, resolve(entry.parentPath, entry.name))))
	.sort();
const discovered = [...discoveredRuntime, ...discoveredTypes].sort();
const inventoried = [...inventory.files].sort();
const differential = inventoried;
const guards = discoveredRuntime.filter((path) => isOctaneOnly(path));
const expectedDifferential = discoveredRuntime
	.filter((path) => !isOctaneOnly(path) && !path.includes('/tests/browser/'))
	.sort();
if (JSON.stringify(expectedDifferential) !== JSON.stringify(inventoried))
	fail('differential inventory must cover every paired file and exclude guards/browser');
if (differential.length === 0) fail('differential project files are missing');
if (guards.filter((path) => OCTANE_ONLY_GUARDS.has(path)).length !== OCTANE_ONLY_GUARDS.size)
	fail('octane-only guard files drifted');
if (!guards.some((path) => path.includes('/tests/octane-contracts/')))
	fail('octane-contracts suite is missing');

const classified = classifications.tests.map((entry) => entry.path).sort();
if (JSON.stringify(discovered) !== JSON.stringify(classified))
	fail('every port-authored test must have exactly one classification');
if (new Set(classified).size !== classified.length)
	fail('a port-authored test has multiple classifications');

const TYPE_PARITY_FILES = new Set([
	'packages/drei/typetests/pristine/public-api.test-d.ts',
	'packages/drei/typetests/adapted/public-api.test-d.ts',
]);

for (const entry of classifications.tests) {
	if (entry.disposition === 'react-octane-differential') {
		if (!entry.oracle) fail(`${entry.path} lacks a pinned React oracle`);
		const source = readFileSync(resolve(root, entry.path), 'utf8');
		if (!source.includes('@react-three/drei'))
			fail(`${entry.path} no longer imports its React oracle`);
		if (isOctaneOnly(entry.path))
			fail(`${entry.path} is classified as parity evidence but is an Octane-only guard`);
	} else if (entry.disposition === 'adapted-octane-upstream-suite') {
		const source = readFileSync(resolve(root, entry.path), 'utf8');
		if (
			!entry.path.includes('/tests/browser/') ||
			!entry.oracle ||
			!source.includes('@parity-case adapted:e2e-snapshot') ||
			!source.includes('playright:r3f')
		)
			fail(`${entry.path} does not port the vendored upstream browser case`);
	} else if (entry.disposition === 'repo-authored-type-parity') {
		if (!TYPE_PARITY_FILES.has(entry.path) || !entry.oracle)
			fail(`${entry.path} is not a declared public-API type parity file`);
	} else if (!entry.disposition.startsWith('octane-only-') || !entry.reason || entry.oracle) {
		fail(`${entry.path} has an invalid unpaired classification`);
	} else if (entry.disposition === 'octane-only-divergence') {
		if (!entry.divergenceId)
			fail(`${entry.path}: divergence tests require a manifest divergence id`);
		if (!manifest.divergences.some((divergence) => divergence.id === entry.divergenceId))
			fail(`${entry.path}: divergence id is not present in the parity manifest`);
	} else if (entry.path.includes('/typetests/')) {
		if (TYPE_PARITY_FILES.has(entry.path))
			fail(`${entry.path} public-API type pair must use repo-authored-type-parity`);
	} else if (!isOctaneOnly(entry.path)) {
		fail(`${entry.path} is classified Octane-only but is not a declared guard`);
	}
}

if (
	JSON.stringify(evidence.files.map((entry) => entry.path).sort()) !==
	JSON.stringify(discoveredRuntime)
)
	fail('runtime file evidence does not cover the complete suite');
for (const file of evidence.files) {
	const contents = readFileSync(resolve(root, file.path));
	if (digest(contents) !== file.sha256) fail(`${file.path} file hash drifted`);
	const assertions = inventory.tests.filter((test) => test.file === file.path);
	if (inventoried.includes(file.path)) {
		if (assertions.length !== file.assertionCount) fail(`${file.path} lost or gained an assertion`);
		if (
			digest(assertions.map((test) => test.fullName).join('\n')) !== file.assertionInventorySha256
		)
			fail(`${file.path} assertion inventory drifted`);
	}
}

const discoveredUpstream = readdirSync(resolve(root, 'packages/drei/upstream/test'), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile())
	.map((entry) => portable(relative(root, resolve(entry.parentPath, entry.name))))
	.sort();
if (
	JSON.stringify(upstream.artifacts.map((entry) => entry.path).sort()) !==
	JSON.stringify(discoveredUpstream)
)
	fail('every vendored upstream test artifact must have exactly one disposition');
for (const artifact of upstream.artifacts) {
	if (!artifact.disposition || !artifact.reason)
		fail(`${artifact.path} lacks a disposition or reason`);
	if (artifact.path.endsWith('/snapshot.test.ts') && artifact.disposition !== 'executed-pristine')
		fail('the vendored Playwright screenshot case must execute in the pristine Playwright lane');
	if (
		!artifact.path.endsWith('/snapshot.test.ts') &&
		!['out-of-scope', 'support'].includes(artifact.disposition)
	)
		fail(`${artifact.path} has an invalid supporting artifact disposition`);
	if (!existsSync(resolve(root, artifact.path))) fail(`${artifact.path} is missing`);
	if (digest(readFileSync(resolve(root, artifact.path))) !== artifact.sha256)
		fail(`${artifact.path} hash drifted`);
}
if (upstream.upstreamRuntimeSuite !== 'insufficient')
	fail('pinned Drei Playwright gallery must be recorded as an insufficient runtime suite');
if (upstream.upstreamTypeSuite !== 'absent')
	fail('pinned Drei must not claim an upstream type suite');
if (
	manifest.upstreamSuites?.runtime !== 'insufficient' ||
	manifest.upstreamSuites?.types !== 'absent'
)
	fail('react-parity manifest suite states must match the upstream artifact ledger');
const pristineLane = manifest.lanes.find((lane) => lane.id === 'drei-pristine-upstream');
if (
	pristineLane?.type !== 'pristine-upstream' ||
	pristineLane.evidenceOrigin !== 'upstream-suite' ||
	pristineLane.execution?.kind !== 'playwright-full' ||
	pristineLane.execution?.root !== 'packages/drei/upstream' ||
	!pristineLane.files.some(
		(file) =>
			file.path === 'packages/drei/upstream/test/e2e/snapshot.test.ts' && file.role === 'support',
	)
)
	fail(
		'the vendored Playwright screenshot case must execute unchanged in a pristine playwright-full lane',
	);
const adaptedE2eLane = manifest.lanes.find((lane) => lane.id === 'drei-adapted-upstream-e2e');
if (
	adaptedE2eLane?.type !== 'adapted-octane' ||
	adaptedE2eLane.evidenceOrigin !== 'upstream-suite' ||
	adaptedE2eLane.execution?.kind !== 'vitest-full'
)
	fail('the Octane e2e port must remain separate adapted upstream-suite evidence');
const differentialLane = manifest.lanes.find(
	(lane) => lane.id === 'drei-repo-authored-differential',
);
if (
	differentialLane?.files?.some(
		(file) => file.path === 'packages/drei/tests/view-renderer-boundary.test.ts',
	)
)
	fail('view-renderer-boundary must not be claimed as differential lane evidence');
if (manifest.lanes.some((lane) => lane.id === 'drei-octane-only-view-boundary'))
	fail('view-renderer-boundary must not be registered as a React-parity lane');
if (
	manifest.lanes.some((lane) =>
		lane.files?.some(
			(file) =>
				file.role === 'test' && file.path === 'packages/drei/tests/view-renderer-boundary.test.ts',
		),
	)
)
	fail('view-renderer-boundary must stay outside required parity-lane test evidence');
const boundaryDivergence = manifest.divergences.find(
	(entry) => entry.id === 'view-renderer-boundary',
);
if (
	!boundaryDivergence?.caseIds?.includes('ordinary:view-renderer-boundary') ||
	!boundaryDivergence.ordinaryEvidence?.some(
		(evidence) =>
			evidence.id === 'ordinary:view-renderer-boundary' &&
			evidence.path === 'packages/drei/tests/view-renderer-boundary.test.ts',
	)
)
	fail(
		'view-renderer-boundary must cite ordinary:view-renderer-boundary audit identity outside parity lanes',
	);
const boundaryClassification = classifications.tests.find(
	(entry) => entry.path === 'packages/drei/tests/view-renderer-boundary.test.ts',
);
if (
	boundaryClassification?.disposition !== 'octane-only-divergence' ||
	boundaryClassification.divergenceId !== 'view-renderer-boundary'
)
	fail('view-renderer-boundary must be classified as ordinary octane-only-divergence evidence');
const upstreamFiles = readdirSync(resolve(root, 'packages/drei/upstream'), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile())
	.map((entry) => resolve(entry.parentPath, entry.name));
if (upstreamFiles.some((path) => /(?:type.?tests?|__typetest__)/i.test(path)))
	fail('upstream type-test absence claim is stale');
const actualExpectErrors = upstreamFiles.flatMap((path) =>
	/\.[cm]?[jt]sx?$/.test(path)
		? readFileSync(path, 'utf8')
				.split('\n')
				.flatMap((line, index) =>
					line.includes('@ts-expect-error')
						? [
								{
									path: portable(relative(root, path)),
									line: index + 1,
									sha256: digest(line.trim()),
								},
							]
						: [],
				)
		: [],
);
if (JSON.stringify(actualExpectErrors) !== JSON.stringify(upstream.upstreamSourceExpectErrors))
	fail('an upstream source @ts-expect-error directive was removed, added, or changed');
if (
	JSON.stringify(upstream.allowedTransformations) !==
	JSON.stringify([
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
	])
)
	fail('Drei type parity transformation ledger drifted');

const pristineTypePath = resolve(typeRoot, 'pristine/public-api.test-d.ts');
const adaptedTypePath = resolve(typeRoot, 'adapted/public-api.test-d.ts');
const assertionsPath = resolve(typeRoot, 'assertions.md');
const pristineTypes = readFileSync(pristineTypePath, 'utf8');
const adaptedTypes = readFileSync(adaptedTypePath, 'utf8');
const groups = typeAssertionGroups(pristineTypes);
if (JSON.stringify(groups) !== JSON.stringify(typeAssertionGroups(adaptedTypes)))
	fail('pristine and adapted type assertion-group inventories differ');
if (groups.length === 0) fail('type assertion-group inventory is empty');
if (!readFileSync(assertionsPath, 'utf8').includes('1. Public exports and accepted prop shapes.'))
	fail('type assertion ledger does not document the assertion groups');
if (!pristineTypes.includes('@ts-expect-error') || !adaptedTypes.includes('@ts-expect-error'))
	fail('type assertion pair must retain matching @ts-expect-error directives');
if (normalizedTypeAssertions(pristineTypes) !== normalizedTypeAssertions(adaptedTypes))
	fail('type assertion sources differ outside permitted transformations');
for (const lane of manifest.lanes.filter((lane) =>
	['drei-pristine-types', 'drei-adapted-types'].includes(lane.id),
)) {
	const expectedPath =
		lane.id === 'drei-pristine-types'
			? 'packages/drei/typetests/pristine/public-api.test-d.ts'
			: 'packages/drei/typetests/adapted/public-api.test-d.ts';
	if (!lane.files?.some((file) => file.path === expectedPath && file.role === 'test'))
		fail(`${lane.id} must execute its public API type assertion file`);
}

console.log(
	`Drei parity evidence is current (${inventory.tests.length} differential assertions in ${inventory.files.length} files; ${guards.length} Octane-only guards; ${discoveredTypes.length} type tests classified).`,
);
