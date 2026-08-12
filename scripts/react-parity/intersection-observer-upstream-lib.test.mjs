import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	renderIntersectionObserverAdaptedInventory,
	renderIntersectionObserverUpstreamInventory,
	verifyIntersectionObserverRuntimeCrosswalk,
	verifyIntersectionObserverUpstream,
} from './intersection-observer-upstream-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'intersection-observer-upstream-'));
	const upstreamTests = join(root, 'packages/intersection-observer/upstream/src/__tests__');
	const portedTests = join(root, 'packages/intersection-observer/tests/upstream');
	const fixtures = join(root, 'packages/intersection-observer/tests/_fixtures');
	const audit = join(root, 'packages/intersection-observer/audit');
	await mkdir(upstreamTests, { recursive: true });
	await mkdir(portedTests, { recursive: true });
	await mkdir(fixtures, { recursive: true });
	await mkdir(audit, { recursive: true });
	await writeFile(join(upstreamTests, 'example.test.ts'), "test('same behavior', () => {});\n");
	await writeFile(join(portedTests, 'example.test.ts'), "test('same behavior', () => {});\n");
	await writeFile(join(portedTests, '_setup.ts'), 'export {};\n');
	await writeFile(join(fixtures, 'probes.tsrx'), 'export function Probe() @{ <div /> }\n');
	await writeFile(
		join(root, 'packages/intersection-observer/upstream/SHA256SUMS'),
		renderIntersectionObserverUpstreamInventory(root),
	);
	await writeFile(
		join(audit, 'upstream-adapted.SHA256SUMS'),
		renderIntersectionObserverAdaptedInventory(root),
	);
	const identities = {
		schemaVersion: 1,
		tests: [{ id: 'runtime:1', file: 'example.test.ts', fullName: 'same behavior' }],
	};
	for (const name of [
		'pristine-runtime.json',
		'adapted-runtime.json',
		'pristine-browser-runtime.json',
		'adapted-browser-runtime.json',
	]) {
		await writeFile(join(audit, name), `${JSON.stringify(identities)}\n`);
	}
	return { audit, fixtures, portedTests, root, upstreamTests };
}

test('accepts an intact byte-locked one-for-one adapted suite', async function acceptsIntact() {
	const { root } = await fixture();
	assert.deepEqual(verifyIntersectionObserverUpstream(root), {
		artifacts: 1,
		browserCases: 1,
		portedCases: 1,
		unitCases: 1,
		upstreamCases: 1,
	});
});

test('rejects vendored byte drift', async function rejectsByteDrift() {
	const { root, upstreamTests } = await fixture();
	await writeFile(join(upstreamTests, 'example.test.ts'), "test('changed', () => {});\n");
	assert.throws(function run() {
		verifyIntersectionObserverUpstream(root);
	}, /upstream inventory drifted/);
});

test('rejects a missing adapted artifact', async function rejectsMissingArtifact() {
	const { portedTests, root } = await fixture();
	await unlink(join(portedTests, 'example.test.ts'));
	assert.throws(function run() {
		verifyIntersectionObserverUpstream(root);
	}, /account for every upstream test artifact/);
});

test('rejects an unrecorded adapted title change', async function rejectsTitleDrift() {
	const { portedTests, root } = await fixture();
	await writeFile(join(portedTests, 'example.test.ts'), "test('different behavior', () => {});\n");
	assert.throws(function run() {
		verifyIntersectionObserverUpstream(root);
	}, /test registrations drifted/);
});

test('rejects disabled, focused, or expected-failing adapted tests', async function rejectsMarkers() {
	for (const registration of [
		'describe.skip',
		'describe.only.each',
		'it.todo',
		'it.skip.each',
		'test.failing',
		'it.only',
		'fit',
		'fit.each',
		'xit',
	]) {
		const { portedTests, root } = await fixture();
		await writeFile(
			join(portedTests, 'example.test.ts'),
			`${registration}('same behavior', () => {});\n`,
		);
		assert.throws(
			function run() {
				verifyIntersectionObserverUpstream(root);
			},
			/focused, failing, skip, or todo markers/,
			registration,
		);
	}
});

test('rejects adapted assertion or citation drift even when the title is unchanged', async function rejectsBodyDrift() {
	const { portedTests, root } = await fixture();
	await writeFile(
		join(portedTests, 'example.test.ts'),
		"test('same behavior', () => {}); // Per upstream drift\n",
	);
	assert.throws(function run() {
		verifyIntersectionObserverUpstream(root);
	}, /adapted test inventory drifted/);
});

test('rejects fixture drift in the adapted provenance ledger', async function rejectsFixtureDrift() {
	const { fixtures, root } = await fixture();
	await writeFile(join(fixtures, 'probes.tsrx'), 'export function Probe() @{ <span /> }\n');
	assert.throws(function run() {
		verifyIntersectionObserverUpstream(root);
	}, /adapted test inventory drifted/);
});

test('rejects a removed adapted inventory identity', async function rejectsRemovedIdentity() {
	const { audit, root } = await fixture();
	await writeFile(
		join(audit, 'adapted-runtime.json'),
		`${JSON.stringify({ schemaVersion: 1, tests: [] })}\n`,
	);
	assert.throws(function run() {
		verifyIntersectionObserverRuntimeCrosswalk(root);
	}, /unit pristine\/adapted inventories must match/);
});

test('rejects a renamed adapted inventory identity', async function rejectsRenamedIdentity() {
	const { audit, root } = await fixture();
	await writeFile(
		join(audit, 'adapted-runtime.json'),
		`${JSON.stringify({
			schemaVersion: 1,
			tests: [{ id: 'runtime:1', file: 'example.test.ts', fullName: 'renamed behavior' }],
		})}\n`,
	);
	assert.throws(function run() {
		verifyIntersectionObserverRuntimeCrosswalk(root);
	}, /unit pristine\/adapted inventories must match/);
});

test('rejects a truncated browser adapted inventory', async function rejectsBrowserTruncate() {
	const { audit, root } = await fixture();
	await writeFile(
		join(audit, 'adapted-browser-runtime.json'),
		`${JSON.stringify({ schemaVersion: 1, tests: [] })}\n`,
	);
	assert.throws(function run() {
		verifyIntersectionObserverRuntimeCrosswalk(root);
	}, /browser pristine\/adapted inventories must match/);
});

test('rejects stale adapted SHA ledger when copied from a drifted tree', async function rejectsStaleLedger(t) {
	const { portedTests, root } = await fixture();
	t.after(function cleanup() {
		return rm(root, { recursive: true, force: true });
	});
	const before = await readFile(
		join(root, 'packages/intersection-observer/audit/upstream-adapted.SHA256SUMS'),
		'utf8',
	);
	await writeFile(
		join(portedTests, 'example.test.ts'),
		"test('same behavior', () => { expect(1).toBe(1); });\n",
	);
	assert.notEqual(renderIntersectionObserverAdaptedInventory(root), before);
	assert.throws(function run() {
		verifyIntersectionObserverUpstream(root);
	}, /adapted test inventory drifted/);
});
