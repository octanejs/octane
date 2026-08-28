import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildTypeInventory, readTypeParityConfig } from './react-select-types-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const SIMPLE_TSCONFIG = {
	compilerOptions: {
		strict: true,
		noEmit: true,
		module: 'ESNext',
		moduleResolution: 'Bundler',
		target: 'ES2022',
		skipLibCheck: true,
	},
};

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'react-select-types-'));
	await cp(new URL('../../packages/select/typetests', import.meta.url), join(root, 'typetests'), {
		recursive: true,
	});
	await writeFile(
		join(root, 'typetests/tsconfig.upstream.json'),
		`${JSON.stringify({ ...SIMPLE_TSCONFIG, include: ['./upstream.ts'] }, null, 2)}\n`,
	);
	await writeFile(
		join(root, 'typetests/tsconfig.local.json'),
		`${JSON.stringify({ ...SIMPLE_TSCONFIG, include: ['./local.ts'] }, null, 2)}\n`,
	);
	const config = {
		pairs: [
			{
				upstream: 'typetests/upstream.ts',
				adapted: 'typetests/local.ts',
			},
		],
		inventories: {
			upstream: 'upstream-types.json',
			adapted: 'local-types.json',
		},
		lanes: {
			pristine: {
				compiler: 'tsc',
				project: 'typetests/tsconfig.upstream.json',
			},
			adapted: {
				compiler: 'tsrx-tsc',
				project: 'typetests/tsconfig.local.json',
			},
		},
	};
	return { root, config };
}

test('accepts the committed react-select type pair', function acceptsCommitted() {
	const config = readTypeParityConfig(REPO);
	assert.equal(buildTypeInventory(REPO, config).upstream.length, 1);
});

test('rejects a skipped adapted type-test file', async function rejectsSkippedFile(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await rm(join(value.root, 'typetests/local.ts'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /missing adapted type fixture/);
});

test('rejects deleting an adapted assertion', async function rejectsDeletedAssertion(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.root, 'typetests/local.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace(/\nvoid animatedFactory;\n/, '\n'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ/);
});

test('rejects removing an adapted @ts-expect-error', async function rejectsRemovedExpectError(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.root, 'typetests/local.ts');
	const source = await readFile(file, 'utf8');
	assert.equal(source.includes('@ts-expect-error'), true, 'fixture must contain @ts-expect-error');
	await writeFile(file, source.replace(/\s*\/\/\s*@ts-expect-error[^\n]*\n/, '\n'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ/);
});

test('rejects retargeting an adapted public import', async function rejectsRetargetedImport(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.root, 'typetests/local.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace("from '../src/index'", "from '../src/base'"));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});

test('rejects inventoried fixtures missing from the compiler program', async function rejectsOutsideProgram(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await writeFile(join(value.root, 'typetests/empty.ts'), 'export {};\n');
	await writeFile(
		join(value.root, 'typetests/tsconfig.upstream.json'),
		`${JSON.stringify({ ...SIMPLE_TSCONFIG, include: ['./empty.ts'] }, null, 2)}\n`,
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /not included in compiler program/);
});
