/**
 * Adapted Octane runtime evidence for useSnapshot / useProxy against the pinned
 * `valtio@2.3.2` React hooks at `valtio/esm/react.mjs` and
 * `valtio/esm/react/utils.mjs` (commit 15c64d4d7a7a9bd55d750fa6a317b440978a2b25).
 *
 * Citations (upstream source; upstream ships no standalone unit suite claimed
 * one-for-one here):
 * - subscribe + snapshot update after proxy mutation: react.mjs:14-57
 * - sync notification option: react.mjs:15, 25
 * - useProxy render-time snapshot reads / callback mutations: react/utils.mjs:5-17
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { proxy } from '@octanejs/valtio';
import { act, mount, nextPaint } from '../_helpers';
import { Counter, MutableProxy, SyncCounter } from '../_fixtures/store.tsrx';

function createState() {
	return proxy({
		count: 0,
		other: 0,
		profile: { name: 'Ada' },
	});
}

describe('adapted useSnapshot / useProxy', function () {
	let state: ReturnType<typeof createState>;

	beforeEach(function () {
		state = createState();
	});

	// @parity-case adapted:valtio-snapshot-updates
	it('renders a snapshot and updates after proxy mutations', async function () {
		const result = mount(Counter, { state });
		expect(result.find('#count').textContent).toBe('0');

		result.click('#increment');
		await nextPaint();
		expect(result.find('#count').textContent).toBe('1');
		result.unmount();
	});

	// @parity-case adapted:valtio-snapshot-sync
	it('supports synchronous subscriptions', async function () {
		const asyncState = createState();
		const syncResult = mount(SyncCounter, { state });
		const asyncResult = mount(Counter, { state: asyncState });
		// Attach useSyncExternalStore subscriptions (passive) before mutating.
		await nextPaint();

		// Sync `act` drains renders scheduled during the callback. Valtio's
		// `{ sync: true }` notifies inside that window; non-sync waits on a
		// microtask, so the ordinary Counter still reads the pre-mutation value.
		act(function () {
			state.count = 3;
			asyncState.count = 3;
		});
		expect(syncResult.find('#sync-count').textContent).toBe('3');
		expect(asyncResult.find('#count').textContent).toBe('0');
		syncResult.unmount();
		asyncResult.unmount();
	});

	// @parity-case adapted:valtio-use-proxy
	it('useProxy reads snapshots during render and mutates the source in callbacks', async function () {
		const result = mount(MutableProxy, { state });
		expect(result.find('#proxy-count').textContent).toBe('0');

		result.click('#proxy-count');
		await nextPaint();
		expect(state.count).toBe(1);
		expect(result.find('#proxy-count').textContent).toBe('1');
		result.unmount();
	});
});
