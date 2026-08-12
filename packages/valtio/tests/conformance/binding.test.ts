import { beforeEach, describe, expect, it } from 'vitest';
import { proxy } from '@octanejs/valtio';
import { act, mount, nextPaint } from '../_helpers';
import {
	Counter,
	MutableProxy,
	NestedValue,
	SwitchingValue,
	SyncCounter,
	TwoStores,
} from '../_fixtures/store.tsrx';

const createState = () =>
	proxy({
		count: 0,
		other: 0,
		profile: { name: 'Ada' },
	});

describe('useSnapshot', () => {
	let state: ReturnType<typeof createState>;

	beforeEach(() => {
		state = createState();
	});

	it('renders a snapshot and updates after proxy mutations', async () => {
		const result = mount(Counter, { state });
		expect(result.find('#count').textContent).toBe('0');

		result.click('#increment');
		await nextPaint();
		expect(result.find('#count').textContent).toBe('1');
		result.unmount();
	});

	it('tracks nested snapshot values', async () => {
		const result = mount(NestedValue, { state });
		expect(result.find('#name').textContent).toBe('Ada');

		state.profile.name = 'Grace';
		await nextPaint();
		expect(result.find('#name').textContent).toBe('Grace');
		result.unmount();
	});

	it('keeps multiple hook call sites independent', async () => {
		const left = createState();
		const right = createState();
		right.count = 10;
		const result = mount(TwoStores, { left, right });
		expect([result.find('#left').textContent, result.find('#right').textContent]).toEqual([
			'0',
			'10',
		]);

		left.count = 2;
		await nextPaint();
		expect([result.find('#left').textContent, result.find('#right').textContent]).toEqual([
			'2',
			'10',
		]);
		result.unmount();
	});

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

	it('reads a current snapshot when a render starts accessing a new path', async () => {
		const result = mount(SwitchingValue, { state });
		expect(result.find('#selected').textContent).toBe('0');

		state.other = 7;
		await nextPaint();
		result.click('#show-other');
		expect(result.find('#selected').textContent).toBe('7');
		result.unmount();
	});

	it('useProxy reads snapshots during render and mutates the source in callbacks', async () => {
		const result = mount(MutableProxy, { state });
		expect(result.find('#proxy-count').textContent).toBe('0');

		result.click('#proxy-count');
		await nextPaint();
		expect(state.count).toBe(1);
		expect(result.find('#proxy-count').textContent).toBe('1');
		result.unmount();
	});
});
