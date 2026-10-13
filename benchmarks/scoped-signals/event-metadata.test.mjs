import assert from 'node:assert/strict';
import test from 'node:test';
import { measureEventMetadata } from './event-metadata.mjs';

for (const dev of [false, true]) {
	test(`lifted handlers preserve delegation and publish changed captures (${dev ? 'dev' : 'prod'})`, async () => {
		const result = await measureEventMetadata({ dev });
		assert.equal(
			result.unchangedListenerWrites,
			0,
			'Unchanged callbacks must not reinstall native listeners while their rows reorder.',
		);
		assert.equal(
			result.changedListenerWrites,
			0,
			'Changed captures must reach the existing delegated listeners.',
		);
	});
}
