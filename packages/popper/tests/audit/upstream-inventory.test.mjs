import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import {
	adaptedCaseStructure,
	buildInventory,
	compareInventories,
	validate,
} from '../../audit/upstream-inventory.mjs';

const clone = (value) => structuredClone(value);

test('the pinned upstream inventory validates', async () => {
	const inventory = await buildInventory();
	compareInventories(inventory, clone(inventory));
	assert.equal(inventory.artifacts.length, 54);
	assert.equal(inventory.upstreamCases.length, 20);
	assert.ok(
		inventory.crosswalk.some(function hasStructure(entry) {
			return entry.adaptedStructure && entry.adaptedStructure.tokens.length > 0;
		}),
	);
});

test('fails closed when an upstream artifact is missing', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	expected.artifacts.pop();
	assert.throws(() => compareInventories(actual, expected), /artifact inventory/);
});

test('fails closed when an upstream artifact checksum is stale', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	expected.artifacts[0].sha256 = '0'.repeat(64);
	assert.throws(() => compareInventories(actual, expected), /artifact inventory/);
});

test('fails closed when an upstream case is renamed or missing', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	expected.upstreamCases[0].name += ' renamed';
	assert.throws(() => compareInventories(actual, expected), /case inventory/);
});

test('fails closed when an executable mapping is changed', async () => {
	const actual = await buildInventory();
	const expected = clone(actual);
	expected.crosswalk[0].evidence = 'tests/runtime/missing.test.ts::missing';
	assert.throws(() => compareInventories(actual, expected), /crosswalk/);
});

test('fails closed when an adapted body is weakened without renaming', async function rejectsWeakenedBody(t) {
	const root = await mkdtemp(join(tmpdir(), 'popper-inventory-'));
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	await cp(new URL('../..', import.meta.url), root, {
		recursive: true,
		filter: function skipModules(source) {
			return !String(source).includes('node_modules');
		},
	});
	const adapted = join(root, 'tests/upstream/Manager.test.tsx');
	const source = await readFile(adapted, 'utf8');
	const weakened = source.replace(
		'expect(elements).toHaveLength(2);',
		'// weakened assertion removed',
	);
	assert.notEqual(source, weakened);
	await writeFile(adapted, weakened);
	await assert.rejects(function run() {
		return validate(root);
	}, /crosswalk/);
});

test('adaptedCaseStructure inventories expects and spies', function structuresBody() {
	const source = `
describe('x', function suite() {
  it('renders the expected markup', function test() {
    expect(elements).toHaveLength(2);
    expect(spy).toHaveBeenCalledWith(node);
  });
});
`;
	const structure = adaptedCaseStructure(source, 'renders the expected markup');
	assert.ok(
		structure.tokens.some(function hasExpect(token) {
			return token.startsWith('assert:');
		}),
	);
	assert.ok(structure.sha256.length === 64);
});
