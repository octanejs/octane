import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyEmblaCarouselTestClassifications } from './embla-carousel-classifications-lib.mjs';

async function fixtureRoot(t) {
	const root = await mkdtemp(join(tmpdir(), 'embla-classifications-'));
	t.after(async function cleanup() {
		// Best-effort; temp dirs are reaped by the OS.
	});
	await cp(
		join(import.meta.dirname, '../../packages/embla-carousel'),
		join(root, 'packages/embla-carousel'),
		{
			recursive: true,
		},
	);
	// Discovery also inventories this port's narrowly matched scripts suite.
	await mkdir(join(root, 'scripts/react-parity'), { recursive: true });
	await cp(
		join(import.meta.dirname, 'embla-carousel-classifications-lib.test.mjs'),
		join(root, 'scripts/react-parity/embla-carousel-classifications-lib.test.mjs'),
	);
	return root;
}

test('rejects an unclassified port-authored test addition', async function rejectsUnclassified(t) {
	const root = await fixtureRoot(t);
	const rogueDir = join(root, 'packages/embla-carousel/tests/conformance');
	await mkdir(rogueDir, { recursive: true });
	await writeFile(join(rogueDir, 'extra.test.ts'), 'export {};\n');
	assert.throws(function run() {
		verifyEmblaCarouselTestClassifications(root);
	}, /exactly one classification/);
});

test('rejects a parity classification without an oracle', async function rejectsMissingOracle(t) {
	const root = await fixtureRoot(t);
	const path = join(root, 'packages/embla-carousel/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	const differential = config.tests.find(function findDifferential(entry) {
		return entry.disposition === 'react-octane-differential';
	});
	delete differential.oracle;
	await writeFile(path, JSON.stringify(config, null, 2) + '\n');
	assert.throws(function run() {
		verifyEmblaCarouselTestClassifications(root);
	}, /requires a React oracle/);
});

test('rejects octane-only dispositions for required type-lane probes', async function rejectsOctaneOnlyTypeLane(t) {
	const root = await fixtureRoot(t);
	const path = join(root, 'packages/embla-carousel/audit/test-classifications.json');
	const config = JSON.parse(await readFile(path, 'utf8'));
	const pristine = config.tests.find(function findPristine(entry) {
		return entry.path === 'packages/embla-carousel/typetests/pristine.test-d.ts';
	});
	delete pristine.oracle;
	pristine.disposition = 'octane-only-framework-contract';
	pristine.reason = 'misclassified type probe';
	await writeFile(path, JSON.stringify(config, null, 2) + '\n');
	assert.throws(function run() {
		verifyEmblaCarouselTestClassifications(root);
	}, /required type-lane tests must use repo-authored-type-oracle/);
});

test('accepts the committed classification ledger', function acceptsCommitted() {
	const root = join(import.meta.dirname, '../..');
	const result = verifyEmblaCarouselTestClassifications(root);
	assert.ok(result.tests >= 9);
});
