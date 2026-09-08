import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
	buildProgramInventory,
	buildTypeInventory,
	listCompilerProgramFiles,
	readTypeParityConfig,
	verifyReactColorfulTypes,
} from './react-colorful-types-lib.mjs';
import { verifyReactColorfulTestClassifications } from './react-colorful-classifications-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'react-colorful-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(new URL('../../packages/colorful/audit/type-probes', import.meta.url), upstreamRoot, {
		recursive: true,
	});
	await cp(new URL('../../packages/colorful/typetests', import.meta.url), adaptedRoot, {
		recursive: true,
	});
	await rm(join(upstreamRoot, 'tsconfig.pristine.json'), { force: true });
	await rm(join(adaptedRoot, 'tsconfig.adapted.json'), { force: true });
	await rm(join(adaptedRoot, 'tsconfig.pristine.json'), { force: true });
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: { upstreamRoot: 'upstream', adaptedRoot: 'adapted' },
	};
}

async function packageFixture() {
	const root = await mkdtemp(join(tmpdir(), 'react-colorful-types-pkg-'));
	for (const dir of ['audit', 'typetests', 'src', 'upstream']) {
		await cp(
			new URL(`../../packages/colorful/${dir}`, import.meta.url),
			join(root, `packages/colorful/${dir}`),
			{ recursive: true },
		);
	}
	await cp(
		new URL('../../packages/colorful/tsconfig.json', import.meta.url),
		join(root, 'packages/colorful/tsconfig.json'),
	);
	return root;
}

test('rejects a skipped adapted type-test file', async function rejectsSkippedFile(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	await rm(join(value.adaptedRoot, 'public-api.test.ts'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /every upstream type artifact/);
});

test('rejects deleting an adapted assertion', async function rejectsDeletedAssertion(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace(/\nsetNonce\('nonce'\);/, '\n'));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ|permitted transformations/);
});

test('rejects removing an adapted @ts-expect-error', async function rejectsRemovedExpectError(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test.ts');
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
	const file = join(value.adaptedRoot, 'public-api.test.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace("from '@octanejs/colorful'", "from '../src/index'"));
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /change outside the permitted transformations/);
});

test('rejects dropping the host-event expectType proof', async function rejectsDroppedEventProof(t) {
	const value = await fixture();
	t.after(function cleanup() {
		return rm(value.root, { recursive: true, force: true });
	});
	const file = join(value.adaptedRoot, 'public-api.test.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace(
			/type HexColorInputOnInput[\s\S]*?expectType<HostInputEvent>\([\s\S]*?\);\n/,
			'',
		),
	);
	assert.throws(function run() {
		buildTypeInventory(value.root, value.config);
	}, /assertion groups differ|permitted transformations/);
});

test('rejects excluding a mapped source through the adapted tsconfig', async function rejectsTsconfigExclude(t) {
	const root = await packageFixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const tsconfigPath = join(root, 'packages/colorful/typetests/tsconfig.adapted.json');
	const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf8'));
	tsconfig.include = ['../src/index.ts', 'public-api.test.ts', 'host-input-event.ts'];
	await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, '\t')}\n`);
	assert.throws(function run() {
		verifyReactColorfulTypes(root);
	}, /adaptedPath .* is missing from the adapted compiler program|not covered by any disposition|compiler program/);
});

test('rejects excluding a probe through the pristine probe tsconfig', async function rejectsProbeTsconfigExclude(t) {
	const root = await packageFixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const tsconfigPath = join(root, 'packages/colorful/audit/type-probes/tsconfig.pristine.json');
	await writeFile(
		tsconfigPath,
		`${JSON.stringify(
			{
				compilerOptions: {
					strict: true,
					noEmit: true,
					module: 'ESNext',
					moduleResolution: 'Bundler',
					target: 'ES2022',
					skipLibCheck: true,
					types: [],
				},
				files: ['host-input-event.ts'],
			},
			null,
			'\t',
		)}\n`,
	);
	assert.throws(function run() {
		verifyReactColorfulTypes(root);
	}, /compiler program probes must match/);
});

test('program dispositions cover every compiler-selected upstream and adapted source file', function coversPrograms() {
	const config = readTypeParityConfig(REPO);
	const inventory = buildProgramInventory(REPO, config);
	const upstream = listCompilerProgramFiles(
		REPO,
		config.lanes.pristine.project,
		config.programRoots.upstream,
	);
	const adapted = listCompilerProgramFiles(
		REPO,
		config.lanes.adapted.project,
		config.programRoots.adapted,
	);
	assert.equal(inventory.upstream.length, upstream.length);
	assert.equal(inventory.adapted.length, adapted.length);
	assert.ok(inventory.upstream.length >= 35);
	assert.ok(inventory.adapted.length >= 35);
});

test('fails closed when an upstream program file loses its disposition', function rejectsMissingDisposition() {
	const config = readTypeParityConfig(REPO);
	const broken = structuredClone(config);
	broken.fileDispositions = broken.fileDispositions.filter(function keep(entry) {
		return entry.path !== 'types.ts';
	});
	assert.throws(function run() {
		buildProgramInventory(REPO, broken);
	}, /missing type disposition for upstream program file types\.ts/);
});

test('fails closed when an adapted program file is unmapped', function rejectsUnmappedAdapted() {
	const config = readTypeParityConfig(REPO);
	const broken = structuredClone(config);
	const cssDecl = broken.fileDispositions.find(function find(entry) {
		return entry.path === 'css/styles.css.d.ts';
	});
	cssDecl.adaptedEvidence = [];
	assert.throws(function run() {
		buildProgramInventory(REPO, broken);
	}, /adapted program file css\/styles\.ts is not covered/);
});

test('type-parity records the native-event divergence and validates against pinned inventories', function validatesLive() {
	const result = verifyReactColorfulTypes(REPO);
	assert.equal(result.files, 1);
	assert.ok(result.assertions >= 5);
	assert.ok(result.programFiles.upstream >= 35);
	assert.ok(result.programFiles.adapted >= 35);
});

test('classifies every authored runtime and type test exactly once', function classifiesTests() {
	const result = verifyReactColorfulTestClassifications(REPO);
	assert.equal(result.tests, 12);
});
