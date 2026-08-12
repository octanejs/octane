import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	buildInventory,
	caseStructuralDigest,
	compareAdaptedEvidence,
	compareInventories,
} from '../../audit/upstream-inventory.mjs';

function clone(value) {
	return structuredClone(value);
}

test('the pinned React PDF authorities and case crosswalk validate', async () => {
	const inventory = await buildInventory();
	compareInventories(inventory, clone(inventory));
	assert.equal(inventory.artifacts.length, 157);
	assert.equal(inventory.upstreamCases.length, 182);
	assert.equal(
		inventory.crosswalk.filter(function isPending(entry) {
			return entry.disposition === 'pending-adaptation';
		}).length,
		174,
	);
	assert.equal(
		inventory.crosswalk.filter(function isAdapted(entry) {
			return entry.disposition === 'adapted-and-executable';
		}).length,
		8,
	);
});

test('fails closed when an upstream artifact is missing', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	expected.artifacts.pop();
	assert.throws(() => compareInventories(actual, expected), /artifact inventory/);
});

test('fails closed when an upstream checksum is stale', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	expected.artifacts[0].sha256 = '0'.repeat(64);
	assert.throws(() => compareInventories(actual, expected), /artifact inventory/);
});

test('fails closed when an upstream case is renamed or omitted', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	expected.upstreamCases[0].name += ' renamed';
	assert.throws(() => compareInventories(actual, expected), /case inventory/);
});

test('fails closed when an executable mapping changes', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	const adapted = expected.crosswalk.find(function hasEvidence(entry) {
		return entry.disposition === 'adapted-and-executable';
	});
	assert.ok(adapted);
	adapted.evidence = 'tests/runtime/missing.test.ts::missing';
	assert.throws(() => compareInventories(actual, expected), /crosswalk/);
});

test('fails closed when the public surface changes', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	expected.publicSurface.runtimeExports.pop();
	assert.throws(() => compareInventories(actual, expected), /public surface/);
});

test('fails closed when adapted evidence loses an expectation', () => {
	const upstream = "it('case', () => { expect(value).toBe('fixture'); });";
	const adapted = "it('case', function () { value; });";
	assert.throws(function missingExpectation() {
		compareAdaptedEvidence({
			upstreamSource: upstream,
			upstreamTitle: 'case',
			adaptedSource: adapted,
			adaptedTitle: 'case',
		});
	}, /no expectations/);
});

test('fails closed when adapted evidence has an empty case body', () => {
	const source = "it('case', function () {});";
	assert.throws(function emptyCase() {
		caseStructuralDigest(source, 'case');
	}, /no expectations/);
});

test('fails closed when adapted evidence changes a fixture', () => {
	const upstream = "it('case', () => { expect(value).toBe('upstream fixture'); });";
	const adapted = "it('case', function () { expect(value).toBe('adapted fixture'); });";
	assert.throws(function changedFixture() {
		compareAdaptedEvidence({
			upstreamSource: upstream,
			upstreamTitle: 'case',
			adaptedSource: adapted,
			adaptedTitle: 'case',
		});
	}, /diverges from upstream/);
});

test('fails closed when adapted evidence rewrites the exercised call subject', () => {
	const upstream =
		"it('case', () => { const result = isDataURI(input); expect(result).toBe(true); });";
	const adapted =
		"it('case', function () { const result = alwaysTrue(input); expect(result).toBe(true); });";
	assert.throws(function changedSubject() {
		compareAdaptedEvidence({
			upstreamSource: upstream,
			upstreamTitle: 'case',
			adaptedSource: adapted,
			adaptedTitle: 'case',
		});
	}, /diverges from upstream/);
});

test('fails closed when adapted evidence changes a numeric input', () => {
	const upstream =
		"it('case', () => { const ref = new Ref({ num: 1, gen: 2 }); expect(ref.toString()).toBe('1R2'); });";
	const adapted =
		"it('case', function () { const ref = new Ref({ num: 9, gen: 2 }); expect(ref.toString()).toBe('1R2'); });";
	assert.throws(function changedNumeric() {
		compareAdaptedEvidence({
			upstreamSource: upstream,
			upstreamTitle: 'case',
			adaptedSource: adapted,
			adaptedTitle: 'case',
		});
	}, /diverges from upstream/);
});

test('fails closed when adapted evidence changes a semicolon inside a string fixture', () => {
	const upstream =
		"it('case', () => { expect(dataURItoByteString('data:text/plain;base64,QQ==')).toBe('A'); });";
	const adapted =
		"it('case', function () { expect(dataURItoByteString('data:text/plainbase64,QQ==')).toBe('A'); });";
	assert.throws(function changedFixtureSemicolon() {
		compareAdaptedEvidence({
			upstreamSource: upstream,
			upstreamTitle: 'case',
			adaptedSource: adapted,
			adaptedTitle: 'case',
		});
	}, /diverges from upstream/);
});
