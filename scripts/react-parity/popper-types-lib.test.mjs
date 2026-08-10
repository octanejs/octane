import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { assertionGroups, buildTypeInventory } from './popper-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'popper-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(
		new URL('../../packages/popper/upstream/tag/typings/tests', import.meta.url),
		upstreamRoot,
		{ recursive: true },
	);
	await cp(new URL('../../packages/popper/typetests', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	await rm(join(adaptedRoot, 'public-api.test.ts'), { force: true });
	await rm(join(adaptedRoot, 'assertions.md'), { force: true });
	await writeFile(
		join(adaptedRoot, 'tsconfig.pristine.json'),
		`${JSON.stringify(
			{
				compilerOptions: { noEmit: true, jsx: 'react', strict: true },
				files: ['../upstream/main-test.tsx', '../upstream/svg-test.tsx'].map(function toPath(file) {
					return file.replace('../upstream/', '../upstream/');
				}),
			},
			null,
			2,
		)}\n`.replace(
			'"files": [\n    "../upstream/main-test.tsx",\n    "../upstream/svg-test.tsx"\n  ]',
			'"files": [\n    "../upstream/main-test.tsx",\n    "../upstream/svg-test.tsx"\n  ]',
		),
	);
	// Point pristine config at the fixture upstream copies.
	await writeFile(
		join(adaptedRoot, 'tsconfig.pristine.json'),
		`${JSON.stringify(
			{
				compilerOptions: { noEmit: true, jsx: 'react', strict: true, skipLibCheck: true },
				files: ['../upstream/main-test.tsx', '../upstream/svg-test.tsx'],
			},
			null,
			2,
		)}\n`,
	);
	await writeFile(
		join(adaptedRoot, 'tsconfig.adapted.json'),
		`${JSON.stringify(
			{
				compilerOptions: { noEmit: true, jsx: 'react-jsx', strict: true, skipLibCheck: true },
				files: ['main-test.tsx', 'svg-test.tsx'],
			},
			null,
			2,
		)}\n`,
	);
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: {
			upstreamRoot: 'upstream',
			adaptedRoot: 'adapted',
			adaptedOnly: [],
			lanes: {
				pristine: { project: 'adapted/tsconfig.pristine.json' },
				adapted: { project: 'adapted/tsconfig.adapted.json' },
			},
		},
	};
}

test('inventories non-empty JSX and typed-usage assertion groups', async function inventoriesGroups(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const groups = assertionGroups(
		await readFile(join(value.upstreamRoot, 'main-test.tsx'), 'utf8'),
		'main-test.tsx',
	);
	assert.ok(
		groups.some(function hasJsx(group) {
			return group.startsWith('jsx:Manager');
		}),
	);
	assert.ok(
		groups.some(function hasParam(group) {
			return group === 'render-param:placement';
		}),
	);
	assert.ok(
		groups.some(function hasCall(group) {
			return group === 'call:usePopper';
		}),
	);
	assert.ok(groups.length > 0);
	const inventory = buildTypeInventory(value.root, value.config);
	assert.ok(inventory.upstream[0].assertionGroups.length > 0);
	assert.ok(inventory.adapted[0].assertionGroups.length > 0);
});

test('rejects a skipped adapted type-test file', async function rejectsSkippedFile(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await rm(join(value.adaptedRoot, 'main-test.tsx'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /missing type-test file main-test\.tsx/);
});

test('rejects excluding a paired file through the adapted tsconfig', async function rejectsTsconfigExclude(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await writeFile(
		join(value.adaptedRoot, 'tsconfig.adapted.json'),
		`${JSON.stringify(
			{
				compilerOptions: { noEmit: true, jsx: 'react-jsx', strict: true, skipLibCheck: true },
				files: ['svg-test.tsx'],
			},
			null,
			2,
		)}\n`,
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /not a member of the adapted compiler program/);
});

test('rejects deleting a real adapted typed-usage probe', async function rejectsDeletedProbe(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'main-test.tsx');
	const source = await readFile(file, 'utf8');
	assert.equal(source.includes('placement="top"'), true);
	await writeFile(file, source.replace('\n      placement="top"', ''));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ/);
});

test('rejects retargeting an adapted public import', async function rejectsRetargetedImport(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'main-test.tsx');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace("from '@octanejs/popper'", "from '@octanejs/popper/missing'"),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});
