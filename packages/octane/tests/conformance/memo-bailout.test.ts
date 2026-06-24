import { describe, it, expect } from 'vitest';
import { mount, createLog } from '../_helpers';
import { BailoutHost, ContextHost, CustomCompareHost } from '../_fixtures/memo-bailout.tsrx';

// Ports of memo() bailout heuristics from
// packages/react-reconciler/src/__tests__/ReactMemo-test.js
// (the `sharedTests` block, run against both normal + lazy memo).

describe('memo bailout', () => {
	it('bails out on props equality', () => {
		// Per ReactMemo-test.js:66 — 'bails out on props equality'
		const log = createLog();
		const r = mount(BailoutHost, { log: log.push });
		// Initial mount renders the child once with count=0.
		expect(log.drain()).toEqual(['render:0']);

		// Parent re-renders (tick state) but the child's props are unchanged
		// (count is still 0) — memo should bail out, so NO child render.
		r.click('#tick');
		expect(log.drain()).toEqual([]);

		// Bumping count changes the child's props — memo must re-render.
		r.click('#count');
		expect(log.drain()).toEqual(['render:1']);

		r.unmount();
	});

	it("does not bail out if there's a context change", () => {
		// Per ReactMemo-test.js:101 — "does not bail out if there's a context change"
		const log = createLog();
		const r = mount(ContextHost, { log: log.push });
		// Initial render: context value 0, stable label.
		expect(log.drain()).toEqual(['Count: 0']);

		// Provider value changes from 0 -> 1. The memo'd consumer's props are
		// unchanged (label is stable), but it reads CountContext — a correct
		// memo must NOT bail out, so the child re-renders with the new value.
		r.click('#ctxbump');
		expect(log.drain()).toEqual(['Count: 1']);

		r.unmount();
	});

	it('accepts custom comparison function', () => {
		// Per ReactMemo-test.js:298 — 'accepts custom comparison function'
		const log = createLog();
		const r = mount(CustomCompareHost, { log: log.push });
		// Initial mount renders the child once with count=0; the comparator is
		// not invoked on the first render (no previous props to compare against).
		expect(log.drain()).toEqual(['render:0']);

		// Parent re-renders (tick) but count is unchanged. The custom comparator
		// runs and returns true (0 === 0) → bail out, so NO child render. The
		// comparator log proves the custom function overrode the default.
		r.click('#ctick');
		expect(log.drain()).toEqual(['compare:0->0']);

		// Bumping count changes the prop: comparator returns false (0 !== 1) →
		// re-render with the new count.
		r.click('#ccount');
		expect(log.drain()).toEqual(['compare:0->1', 'render:1']);

		r.unmount();
	});
});
