import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	setTransitionFallbackTimeout,
	getTransitionFallbackTimeout,
	startTransition,
} from 'octane';
import { act, mount, type MountResult } from '../_helpers.js';
import { installViewTransitionMocks } from './_helpers/view-transition-mocks.js';
import {
	DeferredSiblings,
	PropAndCounter,
	SeparateBoundaries,
	SharedBoundary,
	ViewTransitionBoundaries,
	type TextCache,
} from './_fixtures/parallel-transitions.tsrx';

// Ports of React 19.3's parallel transitions (facebook/react#35392, enabled by
// #37290). Each startTransition outside an event or async Action gets its own
// lane; a lane renders and commits on its own, so a suspended transition no
// longer holds an unrelated one. Updates to the same queue stay entangled.

function createCache() {
	const entries = new Map<string, { promise: Promise<string>; resolve(): void }>();
	const entry = (key: string) => {
		let found = entries.get(key);
		if (found === undefined) {
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => (resolve = done));
			found = { promise, resolve: () => resolve(key) };
			entries.set(key, found);
		}
		return found;
	};
	const cache: TextCache = { read: (key) => entry(key).promise };
	// Keys resolve in order within one act, as data that lands together.
	const resolve = (...keys: string[]) =>
		act(() => {
			for (const key of keys) entry(key).resolve();
		});
	return { cache, resolve };
}

/** `pending|optimistic|text` for counter `name`. */
function counter(r: MountResult, name: string): string {
	const root = r.find(`.${name}`);
	return [
		root.querySelector('.pending')!.textContent,
		root.querySelector('.optimistic')!.textContent,
		root.querySelector('.text')!.textContent,
	].join('|');
}

// A failed assertion must not leave a held transition behind for the next test.
const mounted: MountResult[] = [];
afterEach(() => {
	for (const r of mounted.splice(0)) r.unmount();
});

async function mountCounters(App: typeof SeparateBoundaries) {
	const { cache, resolve } = createCache();
	const r = mount(App, { cache });
	mounted.push(r);
	await resolve('a: 0');
	await resolve('b: 0');
	expect(counter(r, 'a')).toBe('idle|0|a: 0');
	expect(counter(r, 'b')).toBe('idle|0|b: 0');
	return { r, resolve };
}

describe('parallel transitions', () => {
	it('commits a single suspended transition once its data resolves (control)', async () => {
		const { r, resolve } = await mountCounters(SeparateBoundaries);
		await act(() => r.click('.a .go'));
		expect(counter(r, 'a')).toBe('pending|saving|a: 0');
		await resolve('a: 1');
		expect(counter(r, 'a')).toBe('idle|1|a: 1');
	});

	// ReactTransition-test.js "when multiple transitions update different
	// queues, they entangle" (19.3 asserts independence despite the name).
	it.each([
		['separate boundaries', SeparateBoundaries],
		['one shared boundary', SharedBoundary],
	] as const)('commits an unrelated transition while another is suspended (%s)', async (_, App) => {
		const { r, resolve } = await mountCounters(App);
		await act(() => r.click('.a .go'));
		expect(counter(r, 'a')).toBe('pending|saving|a: 0');
		await act(() => r.click('.b .go'));
		expect(counter(r, 'b')).toBe('pending|saving|b: 0');

		// B's data arrives first: B commits on its own while A stays held.
		await resolve('b: 1');
		expect(counter(r, 'b')).toBe('idle|1|b: 1');
		expect(counter(r, 'a')).toBe('pending|saving|a: 0');

		await resolve('a: 1');
		expect(counter(r, 'a')).toBe('idle|1|a: 1');
		expect(counter(r, 'b')).toBe('idle|1|b: 1');
	});

	it('keeps a second transition on the same queue entangled with the first', async () => {
		const { r, resolve } = await mountCounters(SeparateBoundaries);
		await act(() => r.click('.a .go'));
		await act(() => r.click('.a .go'));
		expect(counter(r, 'a')).toBe('pending|saving|a: 0');

		// Only the latest state renders, so the first transition's data is never needed.
		await resolve('a: 2');
		expect(counter(r, 'a')).toBe('idle|2|a: 2');
	});

	it('does not wait for a suspended transition that resolves after a later one', async () => {
		const { r, resolve } = await mountCounters(SeparateBoundaries);
		await act(() => r.click('.a .go'));
		await act(() => r.click('.b .go'));

		// A's data arrives first: A commits while B stays held.
		await resolve('a: 1');
		expect(counter(r, 'a')).toBe('idle|1|a: 1');
		expect(counter(r, 'b')).toBe('pending|saving|b: 0');

		await resolve('b: 1');
		expect(counter(r, 'b')).toBe('idle|1|b: 1');
	});

	it('does not hold a hook transition behind an unrelated root.render transition', async () => {
		const { cache, resolve } = createCache();
		const r = mount(PropAndCounter, { cache, text: 'u: 0' });
		mounted.push(r);
		await resolve('u: 0', 'b: 0');
		await act(() => startTransition(() => r.root.render(PropAndCounter, { cache, text: 'u: 1' })));
		await act(() => r.click('.b .go'));
		expect(r.find('.u .text').textContent).toBe('u: 0');
		expect(counter(r, 'b')).toBe('pending|saving|b: 0');

		// B's data arrives first: B commits while the root.render transition holds.
		await resolve('b: 1');
		expect(counter(r, 'b')).toBe('idle|1|b: 1');
		expect(r.find('.u .text').textContent).toBe('u: 0');

		await resolve('u: 1');
		expect(r.find('.u .text').textContent).toBe('u: 1');
	});

	describe('with a transition fallback timeout', () => {
		let previousTimeout: number;
		beforeEach(() => {
			vi.useFakeTimers({ shouldAdvanceTime: false });
			previousTimeout = getTransitionFallbackTimeout();
			setTransitionFallbackTimeout(100);
		});
		afterEach(() => {
			setTransitionFallbackTimeout(previousTimeout);
			vi.useRealTimers();
		});

		it('reveals a fallback-hidden boundary when an unrelated group commits with it', async () => {
			const { r, resolve } = await mountCounters(SeparateBoundaries);
			await act(() => r.click('.a .go'));
			await act(() => vi.advanceTimersByTime(150));
			expect(r.findAll('.fallback-a')).toHaveLength(1);
			await act(() => r.click('.b .go'));
			expect(counter(r, 'b')).toBe('pending|saving|b: 0');

			// A's hidden primary stages first, then B's visible hold: two ready groups.
			await resolve('a: 1', 'b: 1');
			expect(r.findAll('.fallback-a')).toHaveLength(0);
			expect(counter(r, 'a')).toBe('idle|1|a: 1');
			expect(counter(r, 'b')).toBe('idle|1|b: 1');
		});

		it('keeps the fallback deadline when a superseded thenable settles', async () => {
			const { r, resolve } = await mountCounters(SharedBoundary);
			await act(() => r.click('.a .go'));
			await act(() => r.click('.b .go'));
			await act(() => vi.advanceTimersByTime(60));

			// B's data lets B commit; A, the boundary's current wait, is still pending.
			await resolve('b: 1');
			expect(counter(r, 'b')).toBe('idle|1|b: 1');
			expect(counter(r, 'a')).toBe('pending|saving|a: 0');

			// A's budget started with its suspension, not with B's settle.
			await act(() => vi.advanceTimersByTime(50));
			expect(r.findAll('.fallback')).toHaveLength(1);

			await resolve('a: 1');
			expect(r.findAll('.fallback')).toHaveLength(0);
			expect(counter(r, 'a')).toBe('idle|1|a: 1');
		});

		it('keeps a waiting transition pending when a superseded thenable settles behind its fallback', async () => {
			const { r, resolve } = await mountCounters(SharedBoundary);
			await act(() => r.click('.a .go'));
			await act(() => r.click('.b .go'));
			await act(() => vi.advanceTimersByTime(150));
			expect(r.findAll('.fallback')).toHaveLength(1);

			// B's data alone cannot reveal the boundary, and A is still waiting. (Behind a
			// timeout fallback, A's optimistic value follows the optimistic revert rule
			// in actions.ts; this case pins only its pending state.)
			await resolve('b: 1');
			expect(r.findAll('.fallback')).toHaveLength(1);
			expect(r.find('.a .pending').textContent).toBe('pending');

			await resolve('a: 1');
			expect(r.findAll('.fallback')).toHaveLength(0);
			expect(counter(r, 'a')).toBe('idle|1|a: 1');
			expect(counter(r, 'b')).toBe('idle|1|b: 1');
		});

		it('reveals every ready group while a view transition defers one of them', async () => {
			const vt = installViewTransitionMocks();
			try {
				const { r, resolve } = await mountCounters(ViewTransitionBoundaries);
				await act(() => r.click('.a .go'));
				await act(() => r.click('.b .go'));
				await act(() => vi.advanceTimersByTime(150));
				expect(r.findAll('.fallback-a')).toHaveLength(1);
				expect(r.findAll('.fallback-b')).toHaveLength(1);

				// Each reveal now waits for its view transition's update callback.
				const updates: Array<() => unknown> = [];
				(document as any).startViewTransition = (input: any) => {
					updates.push(typeof input === 'function' ? input : input.update);
					const done = Promise.resolve();
					return { ready: done, finished: done, updateCallbackDone: done, skipTransition() {} };
				};
				await resolve('a: 1', 'b: 1');
				// Both reveals start their view transitions now: B's does not wait for A's.
				const started = updates.splice(0);
				expect(started).toHaveLength(2);
				await act(async () => {
					for (const update of started) await update();
				});
				expect(r.findAll('.fallback-a')).toHaveLength(0);
				expect(r.findAll('.fallback-b')).toHaveLength(0);
				expect(counter(r, 'a')).toBe('idle|1|a: 1');
				expect(counter(r, 'b')).toBe('idle|1|b: 1');
			} finally {
				vt.restore();
			}
		});
	});

	// ReactDeferredValue-test.js: a root holding its first render on a
	// useDeferredValue initial value also renders the final value. Whichever
	// attempt has all its data first commits. React 19.3 changed only these
	// cases' pre-warm logs; the committed output is the contract.
	describe('a deferred task spawned by a suspended root render', () => {
		async function mountDeferredSiblings() {
			const { cache, resolve } = createCache();
			const r = mount(DeferredSiblings, { cache });
			mounted.push(r);
			await act(() => {});
			expect(r.container.textContent).toBe('');
			// Each value loads, but each attempt still waits on its sibling.
			await resolve('Final');
			expect(r.container.textContent).toBe('');
			await resolve('Loading...');
			expect(r.container.textContent).toBe('');
			return { r, resolve };
		}

		// "if a suspended render spawns a deferred task that suspends on a
		// sibling, we can finish the original task if the original sibling loads
		// first": upstream's steps load the final value's sibling first.
		it('commits the deferred value when its sibling loads first', async () => {
			const { r, resolve } = await mountDeferredSiblings();
			await resolve('Sibling: Final');
			expect(r.container.textContent).toBe('Final Sibling: Final');

			// The initial value is no longer needed.
			await resolve('Sibling: Loading...');
			expect(r.container.textContent).toBe('Final Sibling: Final');
		});

		// "if a suspended render spawns a deferred task that suspends on a
		// sibling, we can switch to the deferred task without finishing the
		// original one": here the initial value's sibling loads first.
		it('commits the initial value first when its sibling loads first', async () => {
			const { r, resolve } = await mountDeferredSiblings();
			await resolve('Sibling: Loading...');
			expect(r.container.textContent).toBe('Loading... Sibling: Loading...');

			await resolve('Sibling: Final');
			expect(r.container.textContent).toBe('Final Sibling: Final');
		});
	});
});
