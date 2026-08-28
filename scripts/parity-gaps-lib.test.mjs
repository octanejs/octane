import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectBindingParityGaps, formatZeroPinPolicyViolation } from './parity-gaps-lib.mjs';

test('enforces the zero-pin repository policy without a generated report', () => {
	assert.equal(formatZeroPinPolicyViolation({ byFile: new Map(), total: 0 }), null);

	const violation = formatZeroPinPolicyViolation({
		byFile: new Map([
			['packages/octane/tests/example.test.ts', [{ line: 12, title: 'still fails', gap: null }]],
		]),
		total: 1,
	});
	assert.match(violation, /requires zero executable parity-gap pins; found 1/);
	assert.match(violation, /packages\/octane\/tests\/example\.test\.ts:12 — still fails/);
});

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
