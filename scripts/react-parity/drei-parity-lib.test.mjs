import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
	assertDreiParityWiredIntoGenericCheck,
	verifyDreiReactParity,
} from './drei-parity-lib.mjs';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('generic check source invokes the drei verifier and type controls', () => {
	assert.doesNotThrow(function checkWiring() {
		assertDreiParityWiredIntoGenericCheck(REPO);
	});
});

test('omitting the drei verifier from a check copy fails the wiring control', async () => {
	const root = await mkdtemp(join(tmpdir(), 'drei-parity-wire-'));
	await mkdir(join(root, 'scripts/react-parity'), { recursive: true });
	await writeFile(
		join(root, 'scripts/react-parity/check.mjs'),
		`import { verifyLivestoreTypes } from './livestore-types-lib.mjs';\n`,
	);
	assert.throws(function omitVerifier() {
		assertDreiParityWiredIntoGenericCheck(root);
	}, /must invoke verifyDreiReactParity/);
});

test('verifyDreiReactParity succeeds against the live package audit', () => {
	assert.deepEqual(verifyDreiReactParity(REPO), { ok: true });
});
