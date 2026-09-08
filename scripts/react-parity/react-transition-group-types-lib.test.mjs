import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
	buildTypeInventory,
	verifyReactTransitionGroupTypes,
} from './react-transition-group-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'rtg-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(
		new URL('../../packages/transition-group/upstream-types', import.meta.url),
		upstreamRoot,
		{ recursive: true },
	);
	await cp(new URL('../../packages/transition-group/typetests', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	await rm(join(upstreamRoot, 'tsconfig.json'), { force: true });
	await rm(join(adaptedRoot, 'tsconfig.json'), { force: true });
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: { upstreamRoot: 'upstream', adaptedRoot: 'adapted' },
	};
}

async function packageFixture() {
	const root = await mkdtemp(join(tmpdir(), 'rtg-types-pkg-'));
	for (const dir of ['upstream-types', 'typetests', 'audit']) {
		await cp(
			new URL(`../../packages/transition-group/${dir}`, import.meta.url),
			join(root, `packages/transition-group/${dir}`),
			{ recursive: true },
		);
	}
	return root;
}

test('rejects a skipped adapted type-test file', async function rejectsSkippedFile(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await rm(join(value.adaptedRoot, 'react-transition-group-tests.tsx'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /every pristine type probe needs one adapted counterpart/);
});

test('rejects deleting an adapted assertion', async function rejectsDeletedAssertion(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'react-transition-group-tests.tsx');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(
			/\s*<Transition timeout=\{\{ enter: 500, exit: 500 \}\}>[\s\S]*?<\/Transition>/,
			'',
		),
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
	const file = join(value.adaptedRoot, 'react-transition-group-tests.tsx');
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
	const file = join(value.adaptedRoot, 'react-transition-group-tests.tsx');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(/from ['"]\.\.\/src\/index\.ts['"]/, "from '../src/not-the-public-entry.ts'"),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});

test('rejects excluding a probe through tsconfig rather than deleting it', async function rejectsTsconfigExclude(t) {
	const root = await packageFixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const tsconfigPath = join(root, 'packages/transition-group/typetests/tsconfig.json');
	const decoy = join(root, 'packages/transition-group/typetests/decoy.ts');
	await writeFile(decoy, 'export {};\n');
	const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf8'));
	tsconfig.files = ['decoy.ts'];
	await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, '\t')}\n`);
	assert.throws(function run() {
		verifyReactTransitionGroupTypes(root);
	}, /compiler program probes must match/);
});

test('accepts committed type inventories and lane programs', async function acceptsCommitted(t) {
	const root = await packageFixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const summary = verifyReactTransitionGroupTypes(root);
	assert.equal(summary.files, 1);
	assert.ok(summary.assertions > 0);
});
