/**
 * Octane-only divergence: nested sync scroll notification inside a discrete-
 * event flush (flushSync re-entrancy degradation vs React). Unpaired with a
 * React-side scenario, so it stays in ordinary shards outside react-parity
 * ownership. Ledger: nested-flushsync-degradation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { BasicList, captured } from '../_fixtures/list-basic.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

const indices = (r: ReturnType<typeof mount>) =>
	r.findAll('.row').map((el) => Number(el.getAttribute('data-index')));

beforeEach(() => {
	captured.instance = undefined;
	captured.rectCb = undefined;
	captured.scrollEl = undefined;
	captured.onChangeArgs.length = 0;
});

describe('state wiring + scrolling', () => {
	// @parity-case conformance:nested-flush-sync-scroll
	it('sync scroll update inside a discrete-event flush still lands (flushSync degradation)', async () => {
		// #scroll-500's onClick dispatches the scroll event synchronously INSIDE
		// octane's click flush → core notifies sync=true → the adapter's
		// flushSync(rerender) hits octane's re-entrancy guard and degrades to a
		// plain dispatch drained by the ambient flush. The window must still be
		// updated once the click settles.
		const r = mount(BasicList, {});
		await flush();

		r.click('#scroll-500'); // r.click itself wraps in flushSync
		expect(indices(r)).toEqual([9, 10, 11, 12, 13, 14]); // already landed, pre-settle
		r.unmount();
	});
});
