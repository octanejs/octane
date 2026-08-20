import assert from 'node:assert/strict';
import { mkdir, mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyHookFormUpstream } from './hook-form-upstream-lib.mjs';

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'hook-form-upstream-'));
	const upstreamTests = join(root, 'packages/hook-form/upstream/src/__tests__');
	const portedTests = join(root, 'packages/hook-form/tests/upstream');
	await mkdir(upstreamTests, { recursive: true });
	await mkdir(portedTests, { recursive: true });
	await writeFile(join(upstreamTests, 'example.test.ts'), "it('same behavior', () => {});\n");
	await writeFile(join(portedTests, 'example.test.ts'), "it('same behavior', () => {});\n");
	await writeFile(join(upstreamTests, 'example.test.ts.snap'), 'snapshot\n');
	await writeFile(join(portedTests, 'example.test.ts.snap'), 'snapshot\n');
	await mkdir(join(root, 'packages/hook-form/audit'), { recursive: true });
	return { portedTests, root, upstreamTests };
}

test('accepts an intact byte-locked one-for-one adapted suite', async () => {
	const { root } = await fixture();
	assert.deepEqual(verifyHookFormUpstream(root, { lock: false }), {
		artifacts: 2,
		portedCases: 1,
		upstreamCases: 1,
	});
});

test('rejects vendored byte drift through the lock layer', async () => {
	// A fixture root has no audit/upstream.lock.json, so the lock spawn itself
	// must fail closed rather than silently passing.
	const { root, upstreamTests } = await fixture();
	await writeFile(join(upstreamTests, 'example.test.ts'), "it('changed', () => {});\n");
	assert.throws(() => verifyHookFormUpstream(root), /drifted from audit\/upstream\.lock\.json/);
});

test('rejects a missing adapted artifact', async () => {
	const { portedTests, root } = await fixture();
	await unlink(join(portedTests, 'example.test.ts.snap'));
	assert.throws(
		() => verifyHookFormUpstream(root, { lock: false }),
		/account for every upstream test artifact/,
	);
});

test('rejects an unrecorded adapted title change', async () => {
	const { portedTests, root } = await fixture();
	await writeFile(join(portedTests, 'example.test.ts'), "it('different behavior', () => {});\n");
	assert.throws(() => verifyHookFormUpstream(root, { lock: false }), /test registrations drifted/);
});

test('rejects duplicating one port-only case while dropping another', async () => {
	const { portedTests, root, upstreamTests } = await fixture();
	const relativeFile = 'logic/getDirtyFields.test.ts';
	const upstreamFile = join(upstreamTests, relativeFile);
	const portedFile = join(portedTests, relativeFile);
	const firstExtra =
		'should mark an array-valued registered field as dirty with a boolean rather than diffing elements (#13584)';
	const secondExtra =
		'should still diff a field array element-by-element when the array path itself is not a registered leaf';
	await mkdir(join(upstreamTests, 'logic'), { recursive: true });
	await mkdir(join(portedTests, 'logic'), { recursive: true });
	await writeFile(upstreamFile, "it('same dirty behavior', () => {});\n");
	await writeFile(
		portedFile,
		`it('same dirty behavior', () => {});\nit('${firstExtra}', () => {});\nit('${secondExtra}', () => {});\n`,
	);

	assert.doesNotThrow(() => verifyHookFormUpstream(root, { lock: false }));
	await writeFile(
		portedFile,
		`it('same dirty behavior', () => {});\nit('${firstExtra}', () => {});\nit('${firstExtra}', () => {});\n`,
	);
	assert.throws(
		() => verifyHookFormUpstream(root, { lock: false }),
		/expected every recorded Octane regression case to execute once/,
	);
});

test('rejects disabled, focused, or expected-failing adapted tests', async () => {
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
			() => verifyHookFormUpstream(root, { lock: false }),
			/focused, failing, skip, or todo markers/,
			registration,
		);
	}
});

// Body drift with an unchanged title is owned by regeneration: the adapted
// tree is rebuilt from the lock's rewrites plus the committed patches on every
// materialize run, and the parity manifest hashes each patch, so a drifted
// body cannot persist. The registration-level controls above cover the
// remaining fixture-testable contract.
