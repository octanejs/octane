/**
 * @octanejs/nuqs/adapters/react — the standalone (router-less) adapter driving
 * the ported hooks against the REAL browser History API (jsdom): reads the
 * initial value from window.location.search, and writes updates back through
 * history.replaceState so the URL and the hook state stay in sync.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { CounterAppReact } from '../_fixtures/query.tsrx';

// The react adapter throttles URL writes through the shared queue (default
// 50ms, rateLimitFactor 1). Wait past that window so the History API write has
// committed before asserting on window.location — otherwise only the optimistic
// hook state has updated and the URL still lags.
async function flush() {
	for (let i = 0; i < 12; i++) {
		await new Promise((r) => setTimeout(r, 20));
		await nextPaint();
	}
}

beforeEach(() => {
	// Reset the URL between tests so state never leaks through location.search.
	window.history.replaceState(null, '', '/');
});

describe('NuqsAdapter (react adapter)', () => {
	it('reads the initial value from window.location.search', async () => {
		window.history.replaceState(null, '', '/?count=17');
		const r = mount(CounterAppReact, undefined);
		await flush();
		expect(r.find('#count').textContent).toBe('count=17');
		r.unmount();
	});

	it('writes setter updates back to the URL and reflects them in state', async () => {
		window.history.replaceState(null, '', '/?count=1');
		const r = mount(CounterAppReact, undefined);
		await flush();
		r.click('#inc');
		await flush();
		expect(r.find('#count').textContent).toBe('count=2');
		expect(new URLSearchParams(window.location.search).get('count')).toBe('2');
		r.unmount();
	});

	it('clears the key from the URL on setNull (falls back to the default)', async () => {
		window.history.replaceState(null, '', '/?count=5');
		const r = mount(CounterAppReact, undefined);
		await flush();
		r.click('#clear');
		await flush();
		expect(r.find('#count').textContent).toBe('count=0');
		expect(new URLSearchParams(window.location.search).has('count')).toBe(false);
		r.unmount();
	});
});
