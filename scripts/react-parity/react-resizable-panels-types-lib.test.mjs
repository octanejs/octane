import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
	buildTypeInventory,
	projectIncludedProbes,
	verifyLaneProjectsIncludeProbes,
	verifyReactResizablePanelsTypes,
} from './react-resizable-panels-types-lib.mjs';

const repo = join(import.meta.dirname, '../..');

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'rrp-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(
		new URL('../../packages/resizable-panels/audit/type-probes', import.meta.url),
		upstreamRoot,
		{ recursive: true },
	);
	await cp(new URL('../../packages/resizable-panels/typetests', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	await rm(join(upstreamRoot, 'tsconfig.pristine.json'), { force: true });
	await rm(join(upstreamRoot, 'tsconfig.json'), { force: true });
	await rm(join(adaptedRoot, 'tsconfig.json'), { force: true });
	await rm(join(upstreamRoot, 'pristine.ts'), { force: true });
	await rm(join(upstreamRoot, 'expressibility.ts'), { force: true });
	await rm(join(upstreamRoot, 'proposed-public-types.ts'), { force: true });
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: { upstreamRoot: 'upstream', adaptedRoot: 'adapted' },
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
	await writeFile(file, source.replace(/\nexpectType<PanelSize>\(size\);/, ''));
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
	await writeFile(file, source.replace("from '../src/index.tsrx'", "from '../src/Panel.tsrx'"));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});

test('lane TypeScript projects include exactly the inventoried probes', function projectsMatchInventory() {
	const includedPristine = projectIncludedProbes(
		repo,
		'packages/resizable-panels/audit/type-probes/tsconfig.pristine.json',
		'packages/resizable-panels/audit/type-probes',
	);
	const includedAdapted = projectIncludedProbes(
		repo,
		'packages/resizable-panels/typetests/tsconfig.json',
		'packages/resizable-panels/typetests',
	);
	assert.deepEqual(includedPristine, ['public-api.test-d.ts']);
	assert.deepEqual(includedAdapted, ['public-api.test-d.ts']);
	const result = verifyReactResizablePanelsTypes(repo);
	assert.equal(result.files, 1);
});

test('excluding a probe through tsconfig fails closed', async function rejectsTsconfigExclusion(t) {
	const root = await mkdtemp(join(tmpdir(), 'rrp-types-tsconfig-'));
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	mkdirSync(join(root, 'packages/resizable-panels/audit'), { recursive: true });
	mkdirSync(join(root, 'packages/resizable-panels/typetests'), { recursive: true });
	cpSync(
		join(repo, 'packages/resizable-panels/audit/type-probes'),
		join(root, 'packages/resizable-panels/audit/type-probes'),
		{ recursive: true },
	);
	cpSync(
		join(repo, 'packages/resizable-panels/typetests'),
		join(root, 'packages/resizable-panels/typetests'),
		{ recursive: true },
	);
	for (const file of ['type-parity.json', 'pristine-types.json', 'adapted-types.json']) {
		cpSync(
			join(repo, 'packages/resizable-panels/audit', file),
			join(root, 'packages/resizable-panels/audit', file),
		);
	}
	writeFileSync(
		join(root, 'packages/resizable-panels/audit/type-probes/tsconfig.pristine.json'),
		`${JSON.stringify(
			{
				compilerOptions: {
					module: 'esnext',
					lib: ['esnext', 'dom'],
					target: 'esnext',
					noEmit: true,
					moduleResolution: 'bundler',
					strict: true,
					jsx: 'react-jsx',
					types: ['node', 'react', 'react-dom'],
				},
				include: [],
				exclude: ['./public-api.test-d.ts'],
			},
			null,
			2,
		)}\n`,
	);
	assert.throws(function run() {
		verifyReactResizablePanelsTypes(root);
	}, /TypeScript project must include exactly the inventoried probes/);
	const config = JSON.parse(
		readFileSync(join(root, 'packages/resizable-panels/audit/type-parity.json'), 'utf8'),
	);
	const inventory = buildTypeInventory(root, config);
	assert.throws(function run() {
		verifyLaneProjectsIncludeProbes(root, config, inventory);
	}, /TypeScript project must include exactly the inventoried probes/);
});
