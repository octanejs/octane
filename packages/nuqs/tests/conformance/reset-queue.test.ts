/**
 * Regression: NuqsTestingAdapter must reset the shared update queue only ONCE
 * per mount, during the first render — not on every render. A re-render (e.g.
 * hasMemory's setSearchParams after a committed flush) must NOT abort the shared
 * throttle/debounce queues, or a still-pending debounced URL write for the same
 * tree gets silently dropped.
 *
 * Pre-fix (resetQueues() unguarded in the render body), the immediate `b` write
 * commits, re-renders the adapter, and that re-render's resetQueues() aborts the
 * pending debounced `a` write — so no URL update ever carries `a=x`.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { ResetApp } from '../_fixtures/reset.tsrx';
import type { UrlUpdateEvent } from '@octanejs/nuqs/adapters/testing';

async function wait(ms: number) {
	await new Promise((r) => setTimeout(r, ms));
	await nextPaint();
}

describe('NuqsTestingAdapter shared-queue reset', () => {
	it('does not drop a pending debounced write when a re-render happens before it flushes', async () => {
		const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
		const r = mount(ResetApp, { onUrlUpdate });
		await wait(0);

		// Queue a debounced write to `a` (40ms), then immediately commit `b`.
		// The `b` flush re-renders the adapter (hasMemory) while `a` is still
		// pending in the debounce queue.
		r.click('#set-a-debounced');
		r.click('#set-b-now');

		// Let the debounce window elapse and everything settle.
		for (let i = 0; i < 8; i++) await wait(20);

		const sawA = onUrlUpdate.mock.calls.some(([e]) => e.searchParams.get('a') === 'x');
		const sawB = onUrlUpdate.mock.calls.some(([e]) => e.searchParams.get('b') === 'y');
		expect(sawB).toBe(true);
		// The debounced write survives the intervening re-render.
		expect(sawA).toBe(true);
		r.unmount();
	});
});
