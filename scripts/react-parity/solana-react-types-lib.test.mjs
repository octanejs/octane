import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
	adaptedTypeSuiteFiles,
	assertDispositionsCoverVendored,
	buildTypeInventory,
	pristineTypeSuiteFiles,
	readTypeParityConfig,
} from './solana-react-types-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'solana-react-types-'));
	const upstreamRoot = join(root, 'upstream');
	const adaptedRoot = join(root, 'adapted');
	await cp(join(REPO, 'packages/solana-react/upstream/src'), upstreamRoot, {
		recursive: true,
	});
	await cp(join(REPO, 'packages/solana-react/typetests'), adaptedRoot, {
		recursive: true,
	});
	const config = readTypeParityConfig(REPO, 'packages/solana-react/audit/type-parity.json');
	return {
		root,
		upstreamRoot,
		adaptedRoot,
		config: {
			...config,
			upstreamRoot: 'upstream',
			adaptedRoot: 'adapted',
			fileDispositions: config.fileDispositions.map(function remapEvidence(entry) {
				if (!Array.isArray(entry.adaptedEvidence)) return entry;
				return {
					...entry,
					adaptedEvidence: entry.adaptedEvidence.map(function toFixture(path) {
						if (path.startsWith('packages/solana-react/typetests/')) {
							return path.replace('packages/solana-react/typetests/', 'adapted/');
						}
						return path;
					}),
				};
			}),
		},
	};
}

test('rejects a skipped adapted type-test file', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	await rm(join(value.adaptedRoot, '__typetests__/useClient-typetest.ts'));
	assert.throws(() => buildTypeInventory(value.root, value.config), /missing:.*useClient-typetest/);
});

test('rejects deleting an adapted assertion', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.adaptedRoot, '__typetests__/useClient-typetest.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(file, source.replace(/\n\s*client\.foo\.hello\(\) satisfies string;/, '\n'));
	assert.throws(
		() => buildTypeInventory(value.root, value.config),
		/assertion groups differ|permitted transformations/,
	);
});

test('rejects removing an adapted @ts-expect-error', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.adaptedRoot, '__typetests__/useClient-typetest.ts');
	const source = await readFile(file, 'utf8');
	assert.match(source, /@ts-expect-error/);
	await writeFile(file, source.replace(/\s*\/\/\s*@ts-expect-error[^\n]*\n/, '\n'));
	assert.throws(() => buildTypeInventory(value.root, value.config), /assertion groups differ/);
});

test('rejects retargeting an adapted relative import', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const file = join(value.adaptedRoot, '__typetests__/useClient-typetest.ts');
	const source = await readFile(file, 'utf8');
	await writeFile(
		file,
		source.replace("from '../../src/hooks/useClient'", "from '../../src/index'"),
	);
	assert.throws(
		() => buildTypeInventory(value.root, value.config),
		/change outside the permitted transformations/,
	);
});

test('dispositions cover every vendored typetest and expand pristine beyond adapted', () => {
	const config = readTypeParityConfig(REPO, 'packages/solana-react/audit/type-parity.json');
	const vendored = assertDispositionsCoverVendored(REPO, config);
	assert.equal(vendored.length, 16);
	const adapted = adaptedTypeSuiteFiles(config);
	const pristine = pristineTypeSuiteFiles(config);
	assert.deepEqual(adapted, [
		'__typetests__/useClient-typetest.ts',
		'__typetests__/useClientCapability-typetest.ts',
		'query/__typetests__/useRequestQuery-typetest.ts',
	]);
	assert.ok(pristine.length >= 12, `expected expanded pristine lane, got ${pristine.length}`);
	assert.ok(pristine.includes('__typetests__/useSignIn-typetest.ts'));
	assert.ok(pristine.includes('__typetests__/useSignAndSendTransaction-typetest.ts'));
	assert.ok(pristine.includes('__typetests__/selectedWalletAccountContextProvider-typetest.ts'));
	assert.ok(pristine.includes('query/__typetests__/useSubscriptionQuery-typetest.ts'));
});

test('omitting a type disposition fails coverage validation', () => {
	const config = readTypeParityConfig(REPO, 'packages/solana-react/audit/type-parity.json');
	const truncated = {
		...config,
		fileDispositions: config.fileDispositions.slice(1),
	};
	assert.throws(() => assertDispositionsCoverVendored(REPO, truncated), /missing type disposition/);
});

test('pristine inventory pins every pristine-only typetest', () => {
	const config = readTypeParityConfig(REPO, 'packages/solana-react/audit/type-parity.json');
	const inventory = buildTypeInventory(REPO, config);
	const pristineOnly = config.fileDispositions
		.filter(function keep(entry) {
			return entry.disposition === 'pristine-only';
		})
		.map(function path(entry) {
			return entry.path;
		});
	assert.ok(pristineOnly.length > 0);
	const pinned = new Set(
		inventory.upstream.map(function path(entry) {
			return entry.path;
		}),
	);
	for (const file of pristineOnly) {
		assert.ok(pinned.has(file), `pristine inventory missing pin for ${file}`);
	}
	assert.ok(inventory.upstream.length > inventory.adapted.length);
});

test('mutating a pristine-only typetest changes the pristine inventory pin', async (t) => {
	const value = await fixture();
	t.after(() => rm(value.root, { recursive: true, force: true }));
	const baseline = buildTypeInventory(value.root, value.config);
	const file = join(value.upstreamRoot, '__typetests__/useSignIn-typetest.ts');
	const source = await readFile(file, 'utf8');
	assert.match(source, /@ts-expect-error/);
	await writeFile(file, source.replace(/\s*\/\/\s*@ts-expect-error[^\n]*\n/, '\n'));
	const mutated = buildTypeInventory(value.root, value.config);
	assert.notDeepEqual(mutated.upstream, baseline.upstream);
});
