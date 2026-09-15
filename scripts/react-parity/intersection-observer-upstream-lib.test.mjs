import assert from 'node:assert/strict';
import { mkdir, mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	verifyIntersectionObserverRuntimeCrosswalk,
	verifyIntersectionObserverUpstream,
} from './intersection-observer-upstream-lib.mjs';

// Byte integrity of the pinned upstream tree and the regenerated adapted suite
// belongs to audit/upstream.lock.json plus react-port:materialize (its own
// negative controls live in scripts/react-port/materialize*.test.mjs). These
// fixtures exercise the remaining semantic crosswalk layer.
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'intersection-observer-upstream-'));
	const upstreamTests = join(root, 'packages/intersection-observer/upstream/src/__tests__');
	const portedTests = join(root, 'packages/intersection-observer/tests/upstream');
	const audit = join(root, 'packages/intersection-observer/audit');
	await mkdir(upstreamTests, { recursive: true });
	await mkdir(portedTests, { recursive: true });
	await mkdir(audit, { recursive: true });
	await writeFile(join(upstreamTests, 'example.test.ts'), "test('same behavior', () => {});\n");
	await writeFile(join(portedTests, 'example.test.ts'), "test('same behavior', () => {});\n");
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
	return { audit, portedTests, root, upstreamTests };
}

test('accepts an intact one-for-one adapted suite', async function acceptsIntact() {
	const { root } = await fixture();
	assert.deepEqual(verifyIntersectionObserverUpstream(root), {
		artifacts: 1,
		browserCases: 1,
		portedCases: 1,
		unitCases: 1,
		upstreamCases: 1,
	});
});

test('rejects a missing adapted artifact', async function rejectsMissingArtifact() {
	const { portedTests, root } = await fixture();
	await unlink(join(portedTests, 'example.test.ts'));
	assert.throws(function run() {
		verifyIntersectionObserverUpstream(root);
	}, /account for every upstream test artifact/);
});

test('rejects a port-only artifact hiding inside the adapted suite', async function rejectsExtraArtifact() {
	const { portedTests, root } = await fixture();
	await writeFile(join(portedTests, '_setup.ts'), 'export {};\n');
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

test('retains the complete React-version oracle while comparing applicable native cases', async () => {
	const { audit, root } = await fixture();
	const versions = [
		'19.0.0',
		'19.0.0-rc.1',
		'19.0.0-experimental-abcdef',
		'20.1.0',
		'18.3.1',
		'17.0.2',
		'undefined',
		'unknown',
		'19unknown',
		'19',
		'v19.0.0',
	];
	const versionCases = versions.map((version) => ({
		file: 'packages/intersection-observer/upstream/src/__tests__/useOnInView.test.tsx',
		fullName: `detects ref cleanup support for React version ${version}`,
	}));
	const shared = { file: 'example.test.ts', fullName: 'same behavior' };
	await writeFile(
		join(audit, 'pristine-runtime.json'),
		JSON.stringify({ tests: [shared, ...versionCases] }),
	);
	assert.equal(verifyIntersectionObserverRuntimeCrosswalk(root).unitCases, 1);
	await writeFile(
		join(audit, 'pristine-runtime.json'),
		JSON.stringify({ tests: [shared, ...versionCases.slice(1)] }),
	);
	assert.throws(
		() => verifyIntersectionObserverRuntimeCrosswalk(root),
		/retain every original parameterized case/,
	);
	await writeFile(
		join(audit, 'pristine-runtime.json'),
		JSON.stringify({ tests: [shared, ...versionCases, versionCases[0]] }),
	);
	assert.throws(
		() => verifyIntersectionObserverRuntimeCrosswalk(root),
		/retain every original parameterized case/,
	);
	await writeFile(
		join(audit, 'pristine-runtime.json'),
		JSON.stringify({
			tests: [shared, ...versionCases.map((test) => ({ ...test, file: 'unrelated.test.ts' }))],
		}),
	);
	assert.throws(() => verifyIntersectionObserverRuntimeCrosswalk(root), /inventories must match/);
});

test('requires native SSR evidence when the original suite contains an SSR case', async () => {
	const { audit, root } = await fixture();
	const shared = { file: 'example.test.ts', fullName: 'same behavior' };
	const ssr = { file: 'useInView.ssr.test.ts', fullName: 'server rendering' };
	await writeFile(join(audit, 'pristine-runtime.json'), JSON.stringify({ tests: [shared, ssr] }));
	assert.throws(() => verifyIntersectionObserverRuntimeCrosswalk(root), /inventories must match/);
	await writeFile(join(audit, 'adapted-ssr-runtime.json'), JSON.stringify({ tests: [ssr] }));
	assert.equal(verifyIntersectionObserverRuntimeCrosswalk(root).unitCases, 2);
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
