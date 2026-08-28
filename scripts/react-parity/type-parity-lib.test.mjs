import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildTypeInventory, verifyPristineOverlays } from './type-parity-lib.mjs';

const upstream = `import { expectTypeOf, test } from 'vitest';\nimport type { Value } from './source.ts';\ntest('types a value', () => {\n  expectTypeOf<Value>().toEqualTypeOf<string>();\n  // @ts-expect-error wrong value\n  const value: Value = 1;\n});\n`;
const adapted = upstream.replace("'./source.ts'", "'./adapted-source.ts'");

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'type-parity-'));
	await mkdir(join(root, 'upstream'), { recursive: true });
	await mkdir(join(root, 'adapted'), { recursive: true });
	await writeFile(join(root, 'upstream/types.test-d.ts'), upstream);
	await writeFile(join(root, 'adapted/types.test-d.ts'), adapted);
	return {
		root,
		config: {
			upstreamRoot: 'upstream',
			adaptedRoot: 'adapted',
			permittedTransformations: [
				{
					kind: 'import-map',
					file: 'types.test-d.ts',
					from: './source.ts',
					to: './adapted-source.ts',
				},
			],
		},
	};
}

test('accepts a declared import-only adaptation', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	assert.equal(buildTypeInventory(value.root, value.config).upstream.length, 1);
});

test('rejects a missing adapted file', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	await rm(join(value.root, 'adapted/types.test-d.ts'));
	assert.throws(() => buildTypeInventory(value.root, value.config), /every upstream type artifact/);
});

test('rejects removing expectTypeOf', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.root, 'adapted/types.test-d.ts');
	await writeFile(
		file,
		(await readFile(file, 'utf8')).replace(
			'  expectTypeOf<Value>().toEqualTypeOf<string>();\n',
			'',
		),
	);
	assert.throws(() => buildTypeInventory(value.root, value.config), /assertion groups differ/);
});

test('rejects removing @ts-expect-error', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.root, 'adapted/types.test-d.ts');
	await writeFile(
		file,
		(await readFile(file, 'utf8')).replace(/\s*\/\/ @ts-expect-error[^\n]+/, ''),
	);
	assert.throws(() => buildTypeInventory(value.root, value.config), /assertion groups differ/);
});

test('rejects moving @ts-expect-error to a different statement', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.root, 'adapted/types.test-d.ts');
	await writeFile(
		file,
		(await readFile(file, 'utf8')).replace(
			'  // @ts-expect-error wrong value\n  const value: Value = 1;',
			'  // @ts-expect-error wrong value\n  const other = 1;\n  const value: Value = 1;',
		),
	);
	assert.throws(() => buildTypeInventory(value.root, value.config), /assertion groups differ/);
});

test('rejects a renamed group', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.root, 'adapted/types.test-d.ts');
	await writeFile(
		file,
		(await readFile(file, 'utf8')).replace('types a value', 'types another value'),
	);
	assert.throws(() => buildTypeInventory(value.root, value.config), /assertion groups differ/);
});

test('rejects an unapproved transform', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.root, 'adapted/types.test-d.ts');
	await writeFile(
		file,
		(await readFile(file, 'utf8')).replace('./adapted-source.ts', './other.ts'),
	);
	assert.throws(
		() => buildTypeInventory(value.root, value.config),
		/outside the permitted transformations/,
	);
});

test('rejects pristine overlay byte drift', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	await writeFile(join(value.root, 'overlay.test-d.ts'), upstream);
	const config = {
		pristineOverlays: [{ upstream: 'upstream/types.test-d.ts', overlay: 'overlay.test-d.ts' }],
	};
	assert.deepEqual(verifyPristineOverlays(value.root, config), { files: 1 });
	await writeFile(join(value.root, 'overlay.test-d.ts'), `${upstream}\n`);
	assert.throws(() => verifyPristineOverlays(value.root, config), /pristine overlay drifted/);
});
