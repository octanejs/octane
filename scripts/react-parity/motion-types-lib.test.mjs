import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ADAPTED_TYPES, PRISTINE_TYPES, verifyMotionTypes } from './motion-types-lib.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

async function fixtureRoot() {
	const root = await mkdtemp(join(tmpdir(), 'motion-types-'));
	await cp(join(REPO, 'packages/motion/typetests'), join(root, 'packages/motion/typetests'), {
		recursive: true,
	});
	return root;
}

test('verifies the checked-in motion type lanes', () => {
	const result = verifyMotionTypes(REPO);
	assert.equal(result.assertionGroups > 0, true);
});

test('rejects a deleted accepted assertion group', async (t) => {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const pristinePath = join(root, PRISTINE_TYPES);
	const source = await readFile(pristinePath, 'utf8');
	await writeFile(
		pristinePath,
		source.replace(
			'// 1. motion.div host factory is accepted.\n\texpectType<typeof motion.div>(motion.div);\n',
			'',
		),
	);
	assert.throws(function run() {
		verifyMotionTypes(root);
	}, /assertion groups must match/);
});

test('rejects a removed @ts-expect-error negative control', async (t) => {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(root, ADAPTED_TYPES);
	const source = await readFile(adaptedPath, 'utf8');
	await writeFile(
		adaptedPath,
		source.replace(
			'// 8. Rejected assertion: number is not a string.\n\t// @ts-expect-error fixture negative control: number is not assignable to string.\n\tconst rejectedNumberAsString: string = 0;\n',
			'',
		),
	);
	assert.throws(function run() {
		verifyMotionTypes(root);
	}, /assertion groups must match/);
});

test('rejects an undeclared structural drift', async (t) => {
	const root = await fixtureRoot();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const adaptedPath = join(root, ADAPTED_TYPES);
	const source = await readFile(adaptedPath, 'utf8');
	await writeFile(adaptedPath, `${source}\nexport const extra = true;\n`);
	assert.throws(function run() {
		verifyMotionTypes(root);
	}, /permitted import-root transformation/);
});
