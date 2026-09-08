import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildTypeInventory, verifyReactMarkdownTypes } from './react-markdown-types-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'react-markdown-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(new URL('../../packages/markdown/audit/type-probes', import.meta.url), upstreamRoot, {
		recursive: true,
	});
	await cp(new URL('../../packages/markdown/typetests', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	await rm(join(upstreamRoot, 'tsconfig.pristine.json'), { force: true });
	await rm(join(adaptedRoot, 'tsconfig.json'), { force: true });
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: { upstreamRoot: 'upstream', adaptedRoot: 'adapted' },
	};
}

async function packageFixture() {
	const root = await mkdtemp(join(tmpdir(), 'react-markdown-types-pkg-'));
	for (const dir of ['audit', 'typetests']) {
		await cp(
			new URL(`../../packages/markdown/${dir}`, import.meta.url),
			join(root, `packages/markdown/${dir}`),
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
		source.replace(/\nexpectType<typeof defaultUrlTransform>\(defaultUrlTransform\);/, ''),
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
	await writeFile(file, source.replace("from '../src/index'", "from '../src/url-transform'"));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});

test('rejects excluding a probe through tsconfig rather than deleting it', async function rejectsTsconfigExclude(t) {
	const root = await packageFixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const tsconfigPath = join(root, 'packages/markdown/typetests/tsconfig.json');
	const decoy = join(root, 'packages/markdown/typetests/decoy.ts');
	await writeFile(decoy, 'export {};\n');
	const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf8'));
	tsconfig.files = ['decoy.ts'];
	delete tsconfig.include;
	await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, '\t')}\n`);
	assert.throws(function run() {
		verifyReactMarkdownTypes(root);
	}, /compiler program probes must match/);
});

test('accepts committed type inventories and lane programs', async function acceptsCommitted(t) {
	const root = await packageFixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const summary = verifyReactMarkdownTypes(root);
	assert.equal(summary.files, 1);
	assert.ok(summary.assertions > 0);
});
