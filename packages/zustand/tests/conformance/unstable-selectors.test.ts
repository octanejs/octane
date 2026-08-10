/**
 * Bounded-divergence case for unstable fresh-reference selectors.
 * Stays in ordinary shards (octane-only-divergence); not adapted React parity
 * evidence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { useObj, RawObject } from '../_fixtures/shallow.tsrx';

beforeEach(() => {
	useObj.setState({ a: 0, b: 0 });
});

describe('unstable selector — divergence from React', () => {
	// Framework-contract pin for Octane's bounded settle on unstable selectors.
	// Not harness-linked adapted parity evidence until verified upstream suites land.
	it('a fresh-object selector does NOT infinite-loop (octane settles; React would loop + warn)', async () => {
		let renders = 0;
		const r = mount(RawObject, { onRender: () => renders++ });
		await nextPaint();
		// React's useSyncExternalStore would loop forever + console.error
		// "The result of getSnapshot should be cached". Octane renders a BOUNDED
		// number of times and settles — no loop, no crash.
		expect(renders).toBeLessThan(10);
		expect(r.find('#a').textContent).toBe('0');
		useObj.getState().bumpB();
		await nextPaint();
		expect(r.find('#a').textContent).toBe('0');
		r.unmount();
	});
});
