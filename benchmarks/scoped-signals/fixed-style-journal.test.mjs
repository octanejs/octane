import assert from 'node:assert/strict';
import test from 'node:test';
import { measureFixedStyleJournal } from './fixed-style-journal.mjs';

for (const dev of [false, true]) {
	test(`fixed and opaque styles update without extra whole-style reads (${dev ? 'dev' : 'prod'})`, async () => {
		const { scenarios, rows } = await measureFixedStyleJournal({ dev });
		const [fixed, opaque] = scenarios;
		// Happy DOM also reads the attribute once inside each declaration setter.
		// Both consumers write the same six declarations, so those reads cancel.
		assert.equal(
			fixed.styleReads,
			opaque.styleReads,
			'Fixed declarations must not read more whole styles than their opaque-object control.',
		);
		assert.equal(opaque.styleReads, rows * 6, 'Only the six declaration setters may read style.');
	});
}
