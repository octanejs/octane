import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
	CROSSWALK_PATH,
	INVENTORIES,
	refreshVaulAdaptedCrosswalk,
	verifyVaulAdaptedRuntimeStructure,
} from './vaul-runtime-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'vaul-runtime-'));
	for (const relative of [
		'packages/vaul/audit/adapted-runtime-crosswalk.json',
		'packages/vaul/audit/adapted-runtime.json',
		'packages/vaul/audit/adapted-runtime-browser.json',
		'packages/vaul/tests/drawer.test.ts',
		'packages/vaul/tests/_fixtures/drawer.tsrx',
		'packages/vaul/tests/browser/vaul.browser.test.ts',
		'packages/vaul/tests/browser/harness/main.tsrx',
		'packages/vaul/upstream/test/tests/base.spec.ts',
		'packages/vaul/upstream/test/tests/initial-snap.spec.ts',
		'packages/vaul/upstream/test/tests/with-handle.spec.ts',
		'packages/vaul/upstream/test/tests/helpers.ts',
		'packages/vaul/upstream/test/tests/constants.ts',
	]) {
		const destination = join(root, relative);
		await cp(new URL(`../../${relative}`, import.meta.url), destination);
	}
	return root;
}

test('accepts the committed adapted runtime crosswalk', async function acceptsCommitted(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const result = verifyVaulAdaptedRuntimeStructure(root);
	assert.equal(result.cases, 5);
	assert.deepEqual(result.projects, Object.keys(INVENTORIES));
	assert.ok(result.observations > 0);
});

test('deleting an adapted assertion fails even after crosswalk refresh', async function rejectsDeletedAssertion(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/vaul/tests/drawer.test.ts');
	const source = await readFile(path, 'utf8');
	const mutated = source.replace(
		"expect(document.body.querySelector('[data-vaul-drawer]')).toBeNull();",
		'',
	);
	assert.notEqual(mutated, source);
	await writeFile(path, mutated);
	refreshVaulAdaptedCrosswalk(root);
	assert.throws(function run() {
		verifyVaulAdaptedRuntimeStructure(root);
	}, /missing semantic evidence|gone:content/);
});

test('skipping an adapted case fails verification after inventories refresh identity-only', async function rejectsSkippedCase(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/vaul/tests/drawer.test.ts');
	const source = await readFile(path, 'utf8');
	const mutated = source.replace(
		"it('closes when the controlled open prop is set false'",
		"it.skip('closes when the controlled open prop is set false'",
	);
	assert.notEqual(mutated, source);
	await writeFile(path, mutated);
	refreshVaulAdaptedCrosswalk(root);
	assert.throws(function run() {
		verifyVaulAdaptedRuntimeStructure(root);
	}, /skip\/todo\/only\/failing/);
});

test('altering an adapted fixture fails verification after crosswalk refresh', async function rejectsAlteredFixture(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/vaul/tests/_fixtures/drawer.tsrx');
	const source = await readFile(path, 'utf8');
	const mutated = source.replace('data-testid="controlled-close"', 'data-testid="unused-close"');
	assert.notEqual(mutated, source);
	await writeFile(path, mutated);
	refreshVaulAdaptedCrosswalk(root);
	assert.throws(function run() {
		verifyVaulAdaptedRuntimeStructure(root);
	}, /missing required fixture fragment/);
});

test('browser lane semantic check covers wait observation after refresh', async function coversBrowser(t) {
	const root = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/vaul/tests/browser/vaul.browser.test.ts');
	const source = await readFile(path, 'utf8');
	const mutated = source.replace('await page.waitForTimeout(550);\n', '');
	assert.notEqual(mutated, source);
	await writeFile(path, mutated);
	refreshVaulAdaptedCrosswalk(root);
	assert.throws(function run() {
		verifyVaulAdaptedRuntimeStructure(root);
	}, /missing semantic evidence|wait:animation/);
	void CROSSWALK_PATH;
});
