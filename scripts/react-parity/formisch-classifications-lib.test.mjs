import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyFormischClassificationEntries } from './formisch-classifications-lib.mjs';

const manifest = { divergences: [{ id: 'known-divergence' }] };
const classifications = (entry) => ({ schemaVersion: 1, tests: [entry] });

test('rejects an unknown Formisch test disposition', () => {
	assert.throws(
		() =>
			verifyFormischClassificationEntries(
				classifications({ path: 'test.ts', disposition: 'adapted-upstrem' }),
				manifest,
			),
		/unknown test disposition/,
	);
});

test('requires differential tests to identify their React oracle', () => {
	assert.throws(
		() =>
			verifyFormischClassificationEntries(
				classifications({
					path: 'test.ts',
					disposition: 'react-octane-differential',
					reason: 'compares observable output',
				}),
				manifest,
			),
		/require a reason and React oracle/,
	);
});

test('rejects a divergence absent from the manifest', () => {
	assert.throws(
		() =>
			verifyFormischClassificationEntries(
				classifications({
					path: 'test.ts',
					disposition: 'adapted-upstream-with-divergence',
					reason: 'retains the upstream identity',
					divergenceId: 'missing-divergence',
				}),
				manifest,
			),
		/not present in the parity manifest/,
	);
});
