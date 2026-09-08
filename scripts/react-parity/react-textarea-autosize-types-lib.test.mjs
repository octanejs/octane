import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildTypeInventory } from './react-textarea-autosize-types-lib.mjs';

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
	const root = await mkdtemp(join(tmpdir(), 'textarea-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(
		new URL('../../packages/textarea-autosize/audit/type-probes', import.meta.url),
		upstreamRoot,
		{ recursive: true },
	);
	await cp(new URL('../../packages/textarea-autosize/typetests', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	await writeFile(
		join(upstreamRoot, 'tsconfig.pristine.json'),
		`${JSON.stringify({ ...SIMPLE_TSCONFIG, include: ['./public-api.test-d.ts'] }, null, 2)}\n`,
	);
	await writeFile(
		join(adaptedRoot, 'tsconfig.json'),
		`${JSON.stringify({ ...SIMPLE_TSCONFIG, include: ['./public-api.test-d.ts'] }, null, 2)}\n`,
	);
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: {
			upstreamRoot: 'upstream',
			adaptedRoot: 'adapted',
			lanes: {
				pristine: {
					compiler: 'tsc',
					project: 'upstream/tsconfig.pristine.json',
				},
				adapted: {
					compiler: 'tsrx-tsc',
					project: 'adapted/tsconfig.json',
				},
			},
		},
	};
}

test('rejects a skipped adapted type-test file', async function rejectsSkippedFile(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await rm(join(value.adaptedRoot, 'public-api.test-d.ts'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /every upstream type artifact/);
});

test('rejects deleting an adapted assertion', async function rejectsDeletedAssertion(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(/\nexpectType<typeof TextareaAutosize>\(TextareaAutosize\);/, ''),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ/);
});

test('rejects removing an adapted @ts-expect-error', async function rejectsRemovedExpectError(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test-d.ts');
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
	const file = join(value.adaptedRoot, 'public-api.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace("from '../src/index.tsrx'", "from '../src/hooks.ts'"));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});

test('rejects inventoried probes missing from the compiler program', async function rejectsOutsideProgram(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await writeFile(join(value.upstreamRoot, 'empty.ts'), 'export {};\n');
	await writeFile(
		join(value.upstreamRoot, 'tsconfig.pristine.json'),
		`${JSON.stringify({ ...SIMPLE_TSCONFIG, include: ['./empty.ts'] }, null, 2)}\n`,
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /not included in compiler program/);
});
