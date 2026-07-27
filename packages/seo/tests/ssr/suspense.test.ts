// `prerender` re-runs the tree once per suspense wave. Every pass re-registers
// the same components, so anything that allocated a fresh source id per pass, or
// appended instead of replacing, would multiply the metadata silently.
import { describe, it, expect } from 'vitest';
import { prerender } from 'octane/static';
import { SuspensePage } from '../_fixtures/suspense-page.tsrx';

const count = (haystack: string, needle: RegExp) => haystack.match(needle)?.length ?? 0;

describe('metadata across suspense re-passes', () => {
	it('emits each tag exactly once', async () => {
		const value = new Promise<string>((resolve) => setTimeout(() => resolve('settled'), 5));
		const { head = '' } = await prerender(SuspensePage, { value }, { headChannel: 'separate' });

		expect(count(head, /<title/g)).toBe(1);
		expect(head).toContain('<title>Suspense page</title>');
		expect(count(head, /name="description"/g)).toBe(1);
		// Registered from inside the boundary, so it only exists once the data
		// settled, and still exactly once.
		expect(count(head, /name="deferred"/g)).toBe(1);
		expect(head).toContain('content="settled"');
	});

	it('matches a render whose data was already available', async () => {
		const slow = new Promise<string>((resolve) => setTimeout(() => resolve('settled'), 5));
		const fast = Promise.resolve('settled');
		const a = await prerender(SuspensePage, { value: slow }, { headChannel: 'separate' });
		const b = await prerender(SuspensePage, { value: fast }, { headChannel: 'separate' });
		expect(a.head).toBe(b.head);
	});
});
