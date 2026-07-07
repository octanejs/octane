/**
 * Differential parity: the SAME `.tsrx` counter app runs through
 * @octanejs/redux (octane) AND real react-redux (the setup rewrites the
 * import specifiers). After mount and after each dispatch-driving click, the
 * rendered DOM must be byte-identical — proving the octane binding delivers
 * the same selector/equality/re-render semantics as the real one.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/counter.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/redux vs real react-redux', () => {
	it('counter: mount → increment ×2 → decrement renders byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'CounterApp', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('increment', async (i, r) => {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('increment again', async (i, r) => {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('decrement', async (i, r) => {
			await i.click('#dec');
			await r.click('#dec');
		});
		d.unmount();
	});
});
