import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { verifyReactSelectTestClassifications } from './react-select-classifications-lib.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

test('accepts the committed react-select classifications', function acceptsCommitted() {
	assert.equal(typeof verifyReactSelectTestClassifications(repoRoot).tests, 'number');
});

test('rejects a missing authored test classification', async function rejectsMissing(t) {
	const root = await mkdtemp(join(tmpdir(), 'react-select-classifications-'));
	t.after(async function cleanup() {
		await rm(root, { recursive: true, force: true });
	});
	for (const file of ['test-classifications.json', 'react-parity.json']) {
		await cp(
			new URL(`../../packages/select/audit/${file}`, import.meta.url),
			join(root, `packages/select/audit/${file}`),
			{ recursive: true },
		);
	}
	await cp(
		new URL('../../packages/select/tests', import.meta.url),
		join(root, 'packages/select/tests'),
		{ recursive: true },
	);
	await cp(
		new URL('../../packages/select/typetests', import.meta.url),
		join(root, 'packages/select/typetests'),
		{ recursive: true },
	);
	assert.deepEqual(verifyReactSelectTestClassifications(root), {
		tests: verifyReactSelectTestClassifications(repoRoot).tests,
	});
	await writeFile(join(root, 'packages/select/tests/unclassified.test.ts'), 'export {};\n');
	assert.throws(function missingRow() {
		verifyReactSelectTestClassifications(root);
	}, /every authored react-select test must have exactly one classification/);
});
