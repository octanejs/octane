import { describe, it, expect } from 'vitest';
import { mount, act } from './_helpers';
import { ConsecutiveSuspend, swapToSecond } from './_fixtures/consecutive-suspend.tsrx';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe('Suspense — consecutive (re-)suspend on a @try boundary', () => {
	it('removes the @pending fallback after a resolve → re-suspend → resolve sequence', async () => {
		// Mirrors examples/hacker-news StoriesPage: two consecutive useSuspenseQuery
		// calls on the SAME route @try boundary suspend in sequence. After both
		// resolve, the pending skeleton must be gone — not stuck above the content.
		const a = deferred<string>();
		const b = deferred<string>();
		const r = mount(ConsecutiveSuspend, { a: a.promise, b: b.promise });

		// First render suspends on `a` — only the fallback is shown.
		expect(r.find('.fallback').textContent).toBe('loading');
		expect(r.findAll('.content')).toHaveLength(0);

		// Resolve `a` while the child re-renders ON ITS OWN (its setState — like a
		// query subscriber re-rendering when its query settles) and suspends AGAIN
		// on `b`, the second consecutive query. The boundary is ALREADY pending, so
		// this re-suspend must REPLACE the existing fallback, not stack a second.
		await act(() => {
			a.resolve('A');
			swapToSecond();
		});
		expect(r.findAll('.content')).toHaveLength(0);
		expect(r.findAll('.fallback')).toHaveLength(1);
		expect(r.find('.fallback').textContent).toBe('loading');

		// Resolve `b` → the content mounts AND the fallback is removed. No stuck or
		// duplicate fallback, no leftover pending DOM.
		await act(() => {
			b.resolve('B');
		});
		expect(r.find('.content').textContent).toBe('B');
		expect(r.findAll('.fallback')).toHaveLength(0);

		r.unmount();
	});
});
