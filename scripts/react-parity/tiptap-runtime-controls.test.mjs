import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
	dropAdaptedFixture,
	omitAdaptedIdentity,
	renameAdaptedIdentity,
	verifyTiptapRuntimeCrosswalk,
	verifyTiptapRuntimeScenarios,
} from './tiptap-runtime-lib.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

async function fixtureRoot() {
	const root = await mkdtemp(join(tmpdir(), 'tiptap-runtime-'));
	await mkdir(join(root, 'packages/tiptap/audit'), { recursive: true });
	for (const file of [
		'packages/tiptap/audit/pristine-runtime.json',
		'packages/tiptap/audit/adapted-runtime.json',
		'packages/tiptap/audit/react-parity.json',
		'packages/tiptap/audit/runtime-parity.json',
		'packages/tiptap/UPSTREAM.md',
	]) {
		await mkdir(join(root, file, '..'), { recursive: true });
		await cp(join(REPO, file), join(root, file));
	}
	await cp(join(REPO, 'packages/tiptap/upstream'), join(root, 'packages/tiptap/upstream'), {
		recursive: true,
	});
	await cp(
		join(REPO, 'packages/tiptap/tests/upstream'),
		join(root, 'packages/tiptap/tests/upstream'),
		{ recursive: true },
	);
	return root;
}

test('tiptap runtime crosswalk accepts the committed inventories', function acceptsCommitted() {
	const result = verifyTiptapRuntimeCrosswalk(REPO);
	assert.equal(result.identities, 7);
	assert.equal(result.pristineFiles, 4);
	assert.equal(result.adaptedFiles, 4);
	assert.equal(result.scenarios, 7);
	assert.ok(result.assertions > 0);
	assert.ok(result.interactions > 0);
});

test('source scenario crosswalk accepts the committed adaptations', function acceptsScenarios() {
	assert.deepEqual(verifyTiptapRuntimeScenarios(REPO), {
		pairs: 4,
		scenarios: 7,
		assertions: 78,
		interactions: 12,
	});
});

test('omitting an adapted identity fails the crosswalk', async function omitsIdentity(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/tiptap/audit/adapted-runtime.json');
	const adapted = JSON.parse(await readFile(path, 'utf8'));
	await writeFile(path, `${JSON.stringify(omitAdaptedIdentity(adapted), null, 2)}\n`);
	assert.throws(function run() {
		verifyTiptapRuntimeCrosswalk(root);
	}, /differ in length|omitted pristine identities/);
});

test('renaming an adapted identity fails the crosswalk', async function renamesIdentity(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/tiptap/audit/adapted-runtime.json');
	const adapted = JSON.parse(await readFile(path, 'utf8'));
	await writeFile(path, `${JSON.stringify(renameAdaptedIdentity(adapted), null, 2)}\n`);
	assert.throws(function run() {
		verifyTiptapRuntimeCrosswalk(root);
	}, /omitted pristine identities|absent from pristine/);
});

test('dropping an adapted fixture path fails the crosswalk', async function dropsFixture(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const path = join(root, 'packages/tiptap/audit/adapted-runtime.json');
	const adapted = JSON.parse(await readFile(path, 'utf8'));
	const mutated = dropAdaptedFixture(adapted);
	await writeFile(path, `${JSON.stringify(mutated, null, 2)}\n`);
	assert.throws(function run() {
		verifyTiptapRuntimeCrosswalk(root);
	}, /missing adapted evidence citation|missing fixture|drifted from UPSTREAM/);
});

test('deleting an on-disk adapted fixture fails the crosswalk', async function deletesFixture(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adapted = JSON.parse(
		await readFile(join(root, 'packages/tiptap/audit/adapted-runtime.json'), 'utf8'),
	);
	await rm(join(root, adapted.files[0]));
	assert.throws(function run() {
		verifyTiptapRuntimeCrosswalk(root);
	}, /missing fixture/);
});

test('deleting an adapted assertion fails the scenario crosswalk', async function deletesAssertion(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const file = join(root, 'packages/tiptap/tests/upstream/EditorContent.test.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(/\n\t\texpect\(subscriber\)\.toHaveBeenCalledTimes\(1\);\n/, '\n'),
	);
	assert.throws(function run() {
		verifyTiptapRuntimeScenarios(root);
	}, /assertion groups differ/);
});

test('changing an adapted assertion fails the scenario crosswalk', async function changesAssertion(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const file = join(root, 'packages/tiptap/tests/upstream/EditorContent.test.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace('toHaveBeenCalledTimes(1)', 'toHaveBeenCalledTimes(9)'));
	assert.throws(function run() {
		verifyTiptapRuntimeScenarios(root);
	}, /assertion groups differ/);
});

test('removing an adapted interaction fails the scenario crosswalk', async function removesInteraction(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const file = join(root, 'packages/tiptap/tests/upstream/BubbleMenu.test.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(
			"\telement.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));\n",
			'\t',
		),
	);
	assert.throws(function run() {
		verifyTiptapRuntimeScenarios(root);
	}, /interactions differ/);
});

test('drifting a Per citation to another case fails the scenario crosswalk', async function driftsCitation(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const file = join(root, 'packages/tiptap/tests/upstream/BubbleMenu.test.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(
			'// Per upstream/src/menus/BubbleMenu.spec.ts:42.',
			'// Per upstream/src/menus/BubbleMenu.spec.ts:137.',
		),
	);
	assert.throws(function run() {
		verifyTiptapRuntimeScenarios(root);
	}, /citation .* drifted|does not match/);
});

test('omitting a scenario pair fails inventory coverage', async function omitsPair(t) {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const configPath = join(root, 'packages/tiptap/audit/runtime-parity.json');
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	config.pairs = config.pairs.filter(function keep(pair) {
		return !pair.adapted.endsWith('EditorContent.test.ts');
	});
	await writeFile(configPath, `${JSON.stringify(config, null, '\t')}\n`);
	assert.throws(function run() {
		verifyTiptapRuntimeCrosswalk(root);
	}, /pairs omit .*EditorContent/);
});
