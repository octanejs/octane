import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectBindingParityGaps } from './parity-gaps-lib.mjs';

test('collects failure pins from materialized binding evidence on a clean checkout', () => {
	const repo = mkdtempSync(path.join(tmpdir(), 'binding-parity-gaps-'));
	const packageDirectory = path.join(repo, 'packages/example');
	const packages = [{ name: '@octanejs/example', directory: packageDirectory }];

	const rows = collectBindingParityGaps(packages, repo, {
		ensureEvidence(root) {
			assert.equal(root, repo);
			const testFile = path.join(packageDirectory, 'tests/upstream/example.test.ts');
			mkdirSync(path.dirname(testFile), { recursive: true });
			writeFileSync(testFile, 'test.fails("materialized failure pin", () => {});\n');
		},
	});

	assert.equal(rows.length, 1);
	assert.equal(rows[0].total, 1);
	assert.deepEqual(
		[...rows[0].byFile],
		[
			[
				'packages/example/tests/upstream/example.test.ts',
				[{ line: 1, title: 'materialized failure pin', gap: null }],
			],
		],
	);
});
