import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import {
	App,
	AppIndirect,
	AppSiblings,
	setSink,
} from '../_fixtures/context-bailout.tsrx';

// Ports the context propagation-through-bailout heuristics from
// react-reconciler/src/__tests__/ReactNewContext-test.js. A module-level render
// log (installed via setSink) mirrors React's `Scheduler.log` global; consumers
// and indirection layers take no changing props so memo boundaries genuinely
// bail out on a no-op re-render — matching how the React test is structured.

describe('context propagation: bailout heuristics', () => {
	// Per ReactNewContext-test.js:218 — 'consumers bail out if context value is the same'
	it('a consumer bails out when the new context value is Object.is-equal', () => {
		const log: string[] = [];
		setSink((s) => log.push(s));
		const r = mount(App, { value: 2 });
		// Initial mount renders the whole subtree down to the consumer.
		expect(log).toEqual(['App', 'Indirection', 'Indirection', 'Consumer:2']);
		log.length = 0;

		// Re-render with the SAME value: the Provider re-commits an Object.is-equal
		// value, the memo'd indirections bail, and the consumer is NOT re-rendered.
		r.update(App, { value: 2 });
		expect(log).toEqual(['App']);
		expect(r.find('.consumer').textContent).toBe('2');
		log.length = 0;

		// A genuinely different value DOES reach the consumer, which re-renders
		// with 3. We assert only the faithful part — the consumer received the new
		// value — and deliberately do NOT assert the intermediate memo'd
		// Indirection layers as "correctly" re-rendering: Octane's push-cascade
		// re-renders them, React's lazy propagation does not. That divergence is
		// pinned as a gap in the it.fails below rather than baked in here.
		r.update(App, { value: 3 });
		expect(log.filter((e) => e.startsWith('Consumer'))).toEqual(['Consumer:3']);
		expect(r.find('.consumer').textContent).toBe('3');
		r.unmount();
		setSink(null);
	});

	// Per ReactNewContext-test.js:624 — 'consumer bails out if value is unchanged
	// and something above bailed out'
	it('a same-value re-render with a bailed-out memo subtree skips the consumers', () => {
		const log: string[] = [];
		setSink((s) => log.push(s));
		const r = mount(AppIndirect, { value: 1 });
		expect(log).toEqual(['App', 'PureIndirection', 'Consumer', 'Consumer']);
		log.length = 0;

		// Update (bailout): same value → PureIndirection bails, no consumer re-render.
		// React asserts exactly ['App'] here.
		r.update(AppIndirect, { value: 1 });
		expect(log).toEqual(['App']);
		log.length = 0;

		// Update (no bailout): the changed value reaches BOTH consumers.
		r.update(AppIndirect, { value: 2 });
		// Both consumers re-run with the new value.
		const both = log.filter((e) => e === 'Consumer');
		expect(both).toEqual(['Consumer', 'Consumer']);
		expect(r.findAll('.inline, .cached').map((e) => e.textContent)).toEqual([
			'2',
			'2',
		]);
		r.unmount();
		setSink(null);
	});

	// Per ReactNewContext-test.js:624 — React's lazy context propagation reaches
	// the consumers WITHOUT re-rendering the intermediate bailed-out memo
	// component. React asserts ['App', 'Consumer', 'Consumer'] on the changed
	// value — note the absence of 'PureIndirection'.
	// GAP — ReactNewContext-test.js:696: Octane's context update is a top-down
	// push-cascade, so reaching a consumer behind a memo boundary re-renders that
	// boundary's body too; React propagates straight to the consumer fibers and
	// leaves the bailed-out memo untouched.
	it.fails(
		'a context change reaches consumers without re-rendering the bailed-out memo boundary',
		() => {
			const log: string[] = [];
			setSink((s) => log.push(s));
			const r = mount(AppIndirect, { value: 1 });
			log.length = 0;
			r.update(AppIndirect, { value: 2 });
			const observed = log.slice();
			r.unmount();
			setSink(null);
			// Desired React behavior: only the consumers re-render, not the memo.
			expect(observed).toEqual(['App', 'Consumer', 'Consumer']);
		},
	);

	// Per ReactNewContext-test.js:776 — 'does not skip some siblings'
	// (regression for facebook/react#12686).
	it('a context change does not skip sibling consumers (and spares static siblings)', () => {
		const log: string[] = [];
		setSink((s) => log.push(s));
		const r = mount(AppSiblings, {});
		// Initial mount: no consumer yet (step === 0); StaticContent renders once.
		expect(log).toEqual(['App', 'Static']);
		log.length = 0;

		// step 0 -> 1: the conditionally-mounted consumer appears and reads the new
		// value; the memo'd StaticContent sibling must NOT re-render.
		r.click('#bump');
		expect(log).toEqual(['App', 'Consumer']);
		log.length = 0;

		// step 1 -> 2: the consumer re-renders with the new value; StaticContent
		// stays bailed out. This is the exact #12686 regression — the sibling
		// consumer is not skipped.
		r.click('#bump');
		expect(log).toEqual(['App', 'Consumer']);
		expect(r.find('.sib').textContent).toBe('2');
		expect(r.find('.s1').textContent).toBe('static 1');
		r.unmount();
		setSink(null);
	});
});
