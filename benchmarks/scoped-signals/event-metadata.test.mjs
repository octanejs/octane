import assert from 'node:assert/strict';
import test from 'node:test';
import { measureEventMetadata } from './event-metadata.mjs';

for (const dev of [false, true]) {
	test(`unchanged lifted handlers skip data snapshots without losing native behavior (${dev ? 'dev' : 'prod'})`, async () => {
		const result = await measureEventMetadata({ dev });
		assert.equal(
			result.unchanged,
			0,
			'Unchanged native bundles must not enter the object-snapshot journal.',
		);
		assert.equal(
			result.changed,
			result.rows,
			'Only the changed two-capture handler requires a snapshot.',
		);
	});
}
