import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const repo = path.resolve(import.meta.dirname, '../..');
const packageRoot = path.join(repo, 'packages/resizable-panels');

describe('react-resizable-panels runtime parity evidence', () => {
	test('provenance, identities, classifications, and negative controls are executable', () => {
		execFileSync(
			process.execPath,
			[path.join(packageRoot, 'audit/verify-provenance.mjs'), '--negative-controls'],
			{ cwd: repo },
		);
	});

	test('the Octane entry point has the exact pinned runtime export set', () => {
		const expected = JSON.parse(
			readFileSync(path.join(packageRoot, 'audit/public-api.json'), 'utf8'),
		).runtime.sort();
		const source = readFileSync(path.join(packageRoot, 'src/index.tsrx'), 'utf8');
		const actual = [...source.matchAll(/export\s*\{([^}]+)\}\s*from/g)]
			.flatMap((match) =>
				match[1]
					.split(',')
					.map((name) => name.trim())
					.filter(Boolean),
			)
			.sort();
		assert.deepEqual(actual, expected);
	});

	test('port tests use the documented disposition taxonomy', () => {
		const classifications = JSON.parse(
			readFileSync(path.join(packageRoot, 'audit/test-classifications.json'), 'utf8'),
		);
		const dispositions = new Set(classifications.tests.map((entry) => entry.disposition));
		assert.equal(dispositions.has('port-authored'), false);
		assert.ok(dispositions.has('react-octane-differential'));
		assert.ok(dispositions.has('octane-only-framework-contract'));
		assert.ok(dispositions.has('unmodified-upstream-suite-wrapper'));
	});
});
