import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildTypeInventory } from './alien-signals-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'alien-signals-types-'));
	const upstreamRoot = join(root, 'probes');
	const adaptedRoot = join(root, 'adapted');
	const typecheckRoot = join(root, 'upstream');
	await cp(
		new URL('../../packages/alien-signals/audit/type-probes', import.meta.url),
		upstreamRoot,
		{ recursive: true },
	);
	await cp(new URL('../../packages/alien-signals/typetests', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	await mkdir(join(typecheckRoot, 'src'), { recursive: true });
	await writeFile(
		join(typecheckRoot, 'tsconfig.json'),
		'{ "compilerOptions": { "strict": true } }\n',
	);
	await writeFile(
		join(typecheckRoot, 'src/index.test.ts'),
		await readFile(
			new URL('../../packages/alien-signals/upstream/src/index.test.ts', import.meta.url),
			'utf8',
		),
	);
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		typecheckRoot,
		config: {
			upstreamTypecheck: {
				project: 'upstream/tsconfig.json',
				root: 'upstream',
				files: [
					{
						upstream: 'src/index.test.ts',
						adapted: 'upstream-typecheck.test-d.ts',
						compare: 'assertion-groups',
					},
				],
			},
			upstreamRoot: 'probes',
			adaptedRoot: 'adapted',
			lanes: {
				pristineProbes: {
					compiler: 'tsc',
					project: 'probes/tsconfig.pristine.json',
				},
				adapted: {
					compiler: 'tsrx-tsc',
					project: 'adapted/tsconfig.adapted.json',
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

test('rejects a skipped adapted upstream-typecheck counterpart', async function rejectsSkippedTypecheck(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await rm(join(value.adaptedRoot, 'upstream-typecheck.test-d.ts'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /every upstream type artifact/);
});

test('rejects deleting an adapted expectType assertion', async function rejectsDeletedAssertion(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test-d.ts');
	const source = await readFile(file, 'utf8');
	assert.match(source, /expectType/, 'fixture must contain expectType');
	await writeFile(file, source.replace(/\nexpectType<typeof createSignal>\(createSignal\);/, ''));
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

test('rejects removing the upstream-typecheck @ts-expect-error', async function rejectsTypecheckExpectError(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'upstream-typecheck.test-d.ts');
	const source = await readFile(file, 'utf8');
	assert.equal(source.includes('@ts-expect-error'), true, 'fixture must contain @ts-expect-error');
	await writeFile(file, source.replace(/\s*\/\/\s*@ts-expect-error[^\n]*\n/, '\n'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ/);
});

test('rejects an unauthorized non-assertion structural change', async function rejectsStructuralChange(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test-d.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace('const count:', 'const countSignal:'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});

test('rejects removing an accepted upstream typecheck API call', async function rejectsRemovedAcceptedCall(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'upstream-typecheck.test-d.ts');
	const source = await readFile(file, 'utf8');
	assert.match(source, /useSignalValue\(countSignal\)/, 'fixture must contain an accepted call');
	await writeFile(file, source.replace(/\n\tuseSignalValue\(countSignal\);/, ''));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /accepted API call inventory differs/);
});

test('rejects removing one duplicate accepted call while another remains', async function rejectsRemovedDuplicateAcceptedCall(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'upstream-typecheck.test-d.ts');
	const source = await readFile(file, 'utf8');
	const matches = source.match(/\n\tconst countSignal = createSignal\(0\);/g) ?? [];
	assert.ok(
		matches.length >= 2,
		'fixture must contain duplicate createSignal(0) scenario occurrences',
	);
	await writeFile(file, source.replace(/\n\tconst countSignal = createSignal\(0\);/, ''));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /accepted API call inventory differs/);
});

test('rejects inventoried probes missing from the pristine compiler program', async function rejectsProbeOutsideProgram(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await writeFile(join(value.upstreamRoot, 'empty.ts'), 'export {};\n');
	await writeFile(
		join(value.upstreamRoot, 'tsconfig.pristine.json'),
		JSON.stringify(
			{
				compilerOptions: {
					strict: true,
					noEmit: true,
					module: 'ESNext',
					moduleResolution: 'Bundler',
					target: 'ES2022',
					skipLibCheck: true,
				},
				include: ['empty.ts'],
			},
			null,
			2,
		),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /not included in compiler program/);
});
