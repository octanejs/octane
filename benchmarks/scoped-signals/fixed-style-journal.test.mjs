import assert from 'node:assert/strict';
import test from 'node:test';
import { measureFixedStyleJournal } from './fixed-style-journal.mjs';

for (const dev of [false, true]) {
	test(`fixed style updates reuse the whole-style snapshot (${dev ? 'dev' : 'prod'})`, async () => {
		const { scenarios, rows } = await measureFixedStyleJournal({ dev });
		const [fixed, opaque] = scenarios;
		// Happy DOM also reads the attribute once inside each declaration setter.
		// Both consumers write the same six declarations, so those reads cancel.
		assert.equal(
			fixed.styleReads,
			opaque.styleReads,
			'Fixed declarations must not take more whole-style snapshots than their opaque-object control.',
		);
		assert.equal(opaque.styleReads, rows * 7);
	});
}
