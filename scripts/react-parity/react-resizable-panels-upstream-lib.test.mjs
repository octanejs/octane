import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	applyUseIdFallbackDivergence,
	compareRuntimeIdentityMultisets,
	expectedAdaptedAssertionGroups,
	expectedAdaptedCaseLedger,
	extractAssertionGroups,
	extractCaseLedger,
	mapPristineFileToAdapted,
	runtimeIdentityMultiset,
	structuralSupportSource,
	verifyReactResizablePanelsSupportFiles,
	verifyReactResizablePanelsUpstream,
} from './react-resizable-panels-upstream-lib.mjs';

const repo = join(import.meta.dirname, '../..');

function readRepo(relativePath) {
	return readFileSync(join(repo, relativePath), 'utf8');
}

test('pristine-to-adapted case ledger covers the pinned suite', function coversPinnedSuite() {
	const result = verifyReactResizablePanelsUpstream(repo);
	assert.equal(result.artifacts, 29);
	assert.equal(result.upstreamCases, result.portedCases);
	assert.equal(result.runtimeIdentities, 426);
	assert.ok(result.assertionGroups > 0);
	assert.ok(result.permittedTransformations > 0);
	assert.equal(result.supportFiles, 7);
});

test('support fixtures map to upstream after declared helper transforms', function supportMappings() {
	const result = verifyReactResizablePanelsSupportFiles(repo);
	assert.equal(result.supportFiles, 7);
	const upstreamMove = readRepo(
		'packages/resizable-panels/upstream/lib/global/test/moveSeparator.ts',
	);
	const adaptedMove = readRepo(
		'packages/resizable-panels/tests/upstream/global/test/moveSeparator.ts',
	);
	const rewrites = new Map([
		['@testing-library/user-event', '#rrp-user-event'],
		['../../test/userEvent', '#rrp-user-event'],
		['../../../support/userEvent', '#rrp-user-event'],
		['node:assert', '#rrp-assert'],
		['../../../../src/utils/assert', '#rrp-assert'],
	]);
	assert.equal(
		structuralSupportSource(upstreamMove, 'global/test/moveSeparator.ts', {
			importRewrites: rewrites,
			normalizeAssertImport: true,
		}),
		structuralSupportSource(adaptedMove, 'global/test/moveSeparator.ts', {
			importRewrites: rewrites,
			normalizeAssertImport: true,
		}),
	);
});

test('runtime inventories match one-for-one after explicit path mapping', function crosswalk() {
	const pristine = JSON.parse(readRepo('packages/resizable-panels/audit/pristine-runtime.json'));
	const adapted = JSON.parse(readRepo('packages/resizable-panels/audit/adapted-runtime.json'));
	const expected = runtimeIdentityMultiset(pristine, mapPristineFileToAdapted);
	const actual = runtimeIdentityMultiset(adapted, function identity(file) {
		return file;
	});
	const diff = compareRuntimeIdentityMultisets(expected, actual);
	assert.deepEqual(diff.missing, []);
	assert.deepEqual(diff.unexpected, []);
});

test('hierarchy drift fails full-name case keys even when leaf titles stay equal', function hierarchyDrift() {
	const adapted = readRepo('packages/resizable-panels/tests/upstream/hooks/useId.test.ts');
	const baseline = extractCaseLedger(adapted, 'hooks/useId.test.ts');
	const renamedDescribe = adapted.replace(/describe\((["'])useId\1/, 'describe("useIdRenamed"');
	const drifted = extractCaseLedger(renamedDescribe, 'hooks/useId.test.ts');
	assert.deepEqual(
		drifted.map(function titleOf(entry) {
			return entry.title;
		}),
		baseline.map(function titleOf(entry) {
			return entry.title;
		}),
	);
	assert.notDeepEqual(
		drifted.map(function nameOf(entry) {
			return entry.fullName;
		}),
		baseline.map(function nameOf(entry) {
			return entry.fullName;
		}),
	);
});

test('deleting an adapted assertion fails the pristine mapping', async function rejectsDeletedAssertion(t) {
	const root = await mkdtemp(join(tmpdir(), 'rrp-upstream-'));
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const file = join(repo, 'packages/resizable-panels/tests/upstream/utils/isArrayEqual.test.ts');
	const upstream = await readFile(
		join(repo, 'packages/resizable-panels/upstream/lib/utils/isArrayEqual.test.ts'),
		'utf8',
	);
	const adapted = await readFile(file, 'utf8');
	const expected = expectedAdaptedAssertionGroups('utils/isArrayEqual.test.ts', upstream);
	assert.deepEqual(extractAssertionGroups(adapted, 'utils/isArrayEqual.test.ts'), expected);
	const weakened = adapted.replace(/\n\s*expect\([^;]+;/, '\n');
	assert.notDeepEqual(extractAssertionGroups(weakened, 'utils/isArrayEqual.test.ts'), expected);
	await writeFile(join(root, 'probe.txt'), weakened);
});

test('moving an assertion between cases fails case-keyed mapping', function rejectsMovedAssertion() {
	const upstream = readRepo('packages/resizable-panels/upstream/lib/utils/isArrayEqual.test.ts');
	const adapted = readRepo('packages/resizable-panels/tests/upstream/utils/isArrayEqual.test.ts');
	const expected = expectedAdaptedCaseLedger('utils/isArrayEqual.test.ts', upstream);
	const actual = extractCaseLedger(adapted, 'utils/isArrayEqual.test.ts');
	assert.equal(actual.length, 1);
	const withSibling = adapted.replace(
		/(describe\(["']isArrayEqual["'], \(\) => \{\s*)(test\(["']should work["'], \(\) => \{\s*)(expect\(isArrayEqual\(\[1, 2\], \[1\]\)\)\.toBe\(false\);)/,
		'$1test("sibling", () => {\n    $3\n  });\n  $2',
	);
	const drifted = extractCaseLedger(withSibling, 'utils/isArrayEqual.test.ts');
	assert.notEqual(drifted.length, expected.length);
	const originalCase = drifted.find(function find(entry) {
		return entry.fullName === 'isArrayEqual should work';
	});
	assert.ok(originalCase);
	assert.notDeepEqual(originalCase.assertions, expected[0].assertions);
});

test('replacing an interaction with direct state mutation fails scenario structure', function rejectsStateMutation() {
	const adapted = readRepo(
		'packages/resizable-panels/tests/upstream/hooks/useStableCallback.test.tsx',
	);
	const cases = extractCaseLedger(adapted, 'hooks/useStableCallback.test.tsx');
	const target = cases.find(function find(entry) {
		return entry.scenarioSteps.some(function hasClick(step) {
			return step.includes('fireEvent.click');
		});
	});
	assert.ok(target, 'expected a fireEvent.click scenario step');
	const mutated = adapted.replace(/fireEvent\.click\([^;]+;/, 'result.current = () => {};');
	const drifted = extractCaseLedger(mutated, 'hooks/useStableCallback.test.tsx');
	const driftedCase = drifted.find(function find(entry) {
		return entry.fullName === target.fullName;
	});
	assert.ok(driftedCase);
	assert.notDeepEqual(driftedCase.scenarioSteps, target.scenarioSteps);
	assert.ok(
		driftedCase.scenarioSteps.some(function hasMutation(step) {
			return step.includes('result.current =');
		}),
	);
});

test('non-test.each forEach tables keep row data when collapsing assertions', function preservesForEachTables() {
	const upstream = readRepo(
		'packages/resizable-panels/upstream/lib/global/utils/adjustLayoutByDelta.test.ts',
	);
	const cases = extractCaseLedger(upstream, 'global/utils/adjustLayoutByDelta.test.ts');
	const target = cases.find(function find(entry) {
		return entry.title === 'edge case issues/639';
	});
	assert.ok(target);
	assert.equal(target.scenarioSteps.length, 1);
	assert.match(target.scenarioSteps[0], /\[-10, l\(\[20, 40, 40\]\)\]/);
	assert.match(target.scenarioSteps[0], /\[-50, l\(\[0, 20, 80\]\)\]/);
	assert.match(target.scenarioSteps[0], /\.forEach\(\(\[delta, expectedLayout\]\)/);
	assert.match(target.scenarioSteps[0], /__ASSERTION__/);
	assert.doesNotMatch(target.scenarioSteps[0], /adjustLayoutByDelta/);
	const weakenedRows = upstream.replace('[-50, l([0, 20, 80])]', '[-50, l([0, 0, 100])]');
	const drifted = extractCaseLedger(weakenedRows, 'global/utils/adjustLayoutByDelta.test.ts');
	const driftedCase = drifted.find(function find(entry) {
		return entry.title === 'edge case issues/639';
	});
	assert.ok(driftedCase);
	assert.notDeepEqual(driftedCase.scenarioSteps, target.scenarioSteps);
});

test('test.each bodies enter the case ledger with table, title, and assertions', function recordsEach() {
	const upstream = readRepo(
		'packages/resizable-panels/upstream/lib/global/utils/objectsEqual.test.ts',
	);
	const adapted = readRepo(
		'packages/resizable-panels/tests/upstream/global/utils/objectsEqual.test.ts',
	);
	const expected = expectedAdaptedCaseLedger('global/utils/objectsEqual.test.ts', upstream);
	const actual = extractCaseLedger(adapted, 'global/utils/objectsEqual.test.ts');
	assert.equal(expected.length, 1);
	assert.equal(actual.length, 1);
	assert.equal(expected[0].parameterization.kind, 'test.each');
	assert.ok(expected[0].parameterization.table.includes('EMPTY'));
	assert.equal(expected[0].title, 'objectsEqual: %o, %o -> %o');
	assert.deepEqual(expected[0].assertions, actual[0].assertions);
	assert.deepEqual(expected[0].scenarioSteps, actual[0].scenarioSteps);
	assert.deepEqual(expected[0].parameterization, actual[0].parameterization);
});

test('weakening a test.each body fails while expanded runtime identities stay intact', function rejectsWeakenedEach() {
	const upstream = readRepo(
		'packages/resizable-panels/upstream/lib/global/utils/objectsEqual.test.ts',
	);
	const adapted = readRepo(
		'packages/resizable-panels/tests/upstream/global/utils/objectsEqual.test.ts',
	);
	const expected = expectedAdaptedCaseLedger('global/utils/objectsEqual.test.ts', upstream);
	const weakened = adapted.replace(
		'expect(objectsEqual(a, b)).toBe(expected);',
		'expect(true).toBe(true);',
	);
	const actual = extractCaseLedger(weakened, 'global/utils/objectsEqual.test.ts');
	assert.equal(actual.length, expected.length);
	assert.deepEqual(actual[0].parameterization, expected[0].parameterization);
	assert.equal(actual[0].title, expected[0].title);
	assert.notDeepEqual(actual[0].assertions, expected[0].assertions);
	const pristine = JSON.parse(readRepo('packages/resizable-panels/audit/pristine-runtime.json'));
	const adaptedRuntime = JSON.parse(
		readRepo('packages/resizable-panels/audit/adapted-runtime.json'),
	);
	const identityDiff = compareRuntimeIdentityMultisets(
		runtimeIdentityMultiset(pristine, mapPristineFileToAdapted),
		runtimeIdentityMultiset(adaptedRuntime, function identity(file) {
			return file;
		}),
	);
	assert.deepEqual(identityDiff.missing, []);
	assert.deepEqual(identityDiff.unexpected, []);
});

test('useId divergence transform keeps unrelated weakening fail-closed', function rejectsUnrelatedDivergedWeakening() {
	const upstream = readRepo('packages/resizable-panels/upstream/lib/hooks/useId.test.ts');
	const adapted = readRepo('packages/resizable-panels/tests/upstream/hooks/useId.test.ts');
	const expected = expectedAdaptedCaseLedger('hooks/useId.test.ts', upstream);
	const fallbackExpected = expected.find(function find(entry) {
		return entry.fullName === 'useId should fallback ot React useId';
	});
	assert.ok(fallbackExpected);
	const transformed = applyUseIdFallbackDivergence(fallbackExpected);
	const actual = extractCaseLedger(adapted, 'hooks/useId.test.ts');
	const fallbackActual = actual.find(function find(entry) {
		return entry.fullName === 'useId should fallback ot React useId';
	});
	assert.ok(fallbackActual);
	assert.deepEqual(fallbackActual.assertions, transformed.assertions);
	assert.deepEqual(fallbackActual.scenarioSteps, transformed.scenarioSteps);
	const weakened = adapted.replace(
		'expect(result.current.length).toBeGreaterThan(0);',
		'expect(true).toBe(true);',
	);
	const weakenedLedger = extractCaseLedger(weakened, 'hooks/useId.test.ts');
	const weakenedFallback = weakenedLedger.find(function find(entry) {
		return entry.fullName === 'useId should fallback ot React useId';
	});
	assert.ok(weakenedFallback);
	assert.notDeepEqual(weakenedFallback.assertions, transformed.assertions);
});
