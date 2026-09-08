import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildTypeInventory } from './hook-form-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'hook-form-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(
		new URL('../../packages/hook-form/upstream/src/__typetest__', import.meta.url),
		upstreamRoot,
		{ recursive: true },
	);
	await cp(new URL('../../packages/hook-form/typetests', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: { upstreamRoot: 'upstream', adaptedRoot: 'adapted' },
	};
}

test('rejects a skipped adapted type-test file', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	await rm(join(value.adaptedRoot, 'errors.test-d.ts'));
	assert.throws(() => buildTypeInventory(value.root, value.config), /every upstream type artifact/);
});

test('rejects deleting an adapted assertion', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.adaptedRoot, 'errors.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace(/\s*type _t1 = Expect<[^;]+>;/, ''));
	assert.throws(() => buildTypeInventory(value.root, value.config), /assertion groups differ/);
});

test('rejects removing an adapted @ts-expect-error', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const candidates = ['form.test-d.ts', 'use-form-context.test-d.ts', 'useController.test-d.ts'];
	let changed = false;
	for (const candidate of candidates) {
		const file = join(value.adaptedRoot, candidate);
		const source = await readFile(file, 'utf8');
		if (!source.includes('@ts-expect-error')) continue;
		await writeFile(file, source.replace(/\s*\/\/\s*@ts-expect-error[^\n]*\n/, '\n'));
		changed = true;
		break;
	}
	assert.equal(changed, true, 'fixture must contain @ts-expect-error');
	assert.throws(() => buildTypeInventory(value.root, value.config), /assertion groups differ/);
});

test('rejects retargeting an adapted relative import', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.adaptedRoot, 'errors.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace("from '../src/types'", "from '../src/useForm'"));
	assert.throws(
		() => buildTypeInventory(value.root, value.config),
		/change outside the permitted transformations/,
	);
});
