import { describe, it, expect } from 'vitest';
import { mount, act, createLog } from '../_helpers';
import { FanOut } from './_fixtures/entangled-commit.tsrx';

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

// Global commit coordination (SUSPENSE_DIVERGENCE.md #1/#4): a single transition that
// fans out to several independently-suspending boundaries holds EVERY prior screen
// until ALL their data is ready, then reveals them together — never a half-updated
// screen mid-transition. Here each boundary swaps its content via an off-screen if-block
// swap, so this also exercises the #4 (per-swap off-screen) path under coordination.
describe('conformance: entangled transition commits all boundaries together', () => {
	it('holds both off-screen swaps until both resolve, then reveals together', async () => {
		const da = deferred<string>();
		const db = deferred<string>();
		const log = createLog();
		const r = mount(FanOut as any, { pa: da.promise, pb: db.promise, log });
		await act(() => {});
		expect(r.find('.a').textContent).toBe('A:old');
		expect(r.find('.b').textContent).toBe('B:old');
		expect(r.find('#pending').textContent).toBe('0');

		// One transition swaps BOTH boundaries to suspending content.
		r.click('#go');
		expect(r.find('#pending').textContent).toBe('1');
		expect(r.find('.a').textContent).toBe('A:old'); // prior content held
		expect(r.find('.b').textContent).toBe('B:old');
		expect(r.findAll('.a-fb')).toHaveLength(0); // no fallback flash
		expect(r.findAll('.b-fb')).toHaveLength(0);

		// Resolve A only — its reveal is DEFERRED; both still show old content.
		await act(() => da.resolve('pa'));
		expect(r.find('.a').textContent).toBe('A:old');
		expect(r.find('.b').textContent).toBe('B:old');
		expect(r.find('#pending').textContent).toBe('1');
		expect(log.drain()).toEqual([]); // neither revealed yet → no reveal effect

		// Resolve B — group is data-ready → both reveal together.
		await act(() => db.resolve('pb'));
		expect(r.find('.a').textContent).toBe('A:pa');
		expect(r.find('.b').textContent).toBe('B:pb');
		expect(r.find('#pending').textContent).toBe('0');
		expect(log.drain().sort()).toEqual(['A reveal', 'B reveal']); // both fired in the batch
		r.unmount();
	});
});
