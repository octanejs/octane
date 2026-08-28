import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { verifyBetterAuthTypes } from './better-auth-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'better-auth-types-'));
	await mkdir(join(root, 'packages'), { recursive: true });
	await cp(
		new URL('../../packages/better-auth', import.meta.url),
		join(root, 'packages/better-auth'),
		{
			recursive: true,
		},
	);
	return root;
}

test('accepts the paired Better Auth type evidence', () => {
	verifyBetterAuthTypes();
});

test('rejects deleting an adapted negative control', async (t) => {
	const root = await fixture();
	t.after(() => rm(root, { recursive: true, force: true }));
	const path = join(root, 'packages/better-auth/typetests/parity/public-api.test-d.ts');
	const source = await readFile(path, 'utf8');
	await writeFile(path, source.replace(/\/\/ @ts-expect-error[^\n]*\n/, ''));
	assert.throws(() => verifyBetterAuthTypes(root), /differ outside|expect-error controls differ/);
});

test('rejects a retargeted adapted import', async (t) => {
	const root = await fixture();
	t.after(() => rm(root, { recursive: true, force: true }));
	const path = join(root, 'packages/better-auth/typetests/parity/public-api.test-d.ts');
	const source = await readFile(path, 'utf8');
	await writeFile(path, source.replace("from '../../src/index'", "from 'better-auth/react'"));
	assert.throws(() => verifyBetterAuthTypes(root), /must import \.\.\/\.\.\/src\/index/);
});

test('rejects excluding the adapted probe from its compiler program', async (t) => {
	const root = await fixture();
	t.after(() => rm(root, { recursive: true, force: true }));
	const path = join(root, 'packages/better-auth/typetests/parity/tsconfig.json');
	const source = await readFile(path, 'utf8');
	await writeFile(path, source.replace('"public-api.test-d.ts", ', ''));
	assert.throws(() => verifyBetterAuthTypes(root), /does not include public-api\.test-d\.ts/);
});
