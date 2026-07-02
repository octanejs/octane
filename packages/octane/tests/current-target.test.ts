import { describe, it, expect } from 'vitest';
import { mount, createLog } from './_helpers';
import { Nested, SelfGuard } from './_fixtures/current-target.tsrx';

// React parity: during DELEGATED dispatch, `event.currentTarget` is the element whose
// handler is firing — patched per-handler as the walk ascends (bubble) / descends
// (capture), and restored to native semantics after the dispatch. Surfaced by the
// @octanejs/radix RovingFocusGroup port, whose keyboard nav guards on
// `event.target === event.currentTarget` (ubiquitous in ported React code).

describe('delegated event currentTarget', () => {
	it('bubble handlers see their own element; capture runs root→target with per-element currentTarget', () => {
		const log = createLog();
		const r = mount(Nested, { log: log.push });
		r.click('#inner');
		expect(log.drain()).toEqual([
			// Capture: root → target.
			'capture-outer:outer',
			'capture-inner:inner',
			// Bubble: target → root; each handler's currentTarget is ITS element.
			'inner:inner:target=inner',
			'outer:outer:target=inner',
		]);
		r.unmount();
	});

	it('supports the `target === currentTarget` self-origin guard', () => {
		const log = createLog();
		const r = mount(SelfGuard, { log: log.push });
		r.click('#kid');
		expect(log.drain()).toEqual(['child']);
		r.click('#wrap');
		expect(log.drain()).toEqual(['self']);
		r.unmount();
	});

	it('restores native currentTarget semantics after the dispatch', () => {
		const log = createLog();
		const r = mount(SelfGuard, { log: log.push });
		const kid = r.find('#kid');
		const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
		kid.dispatchEvent(ev);
		// After dispatch completes, the shadowing own-property is removed — the native
		// getter reports null (dispatch is over), not a stale element.
		expect(ev.currentTarget).toBe(null);
		expect(Object.prototype.hasOwnProperty.call(ev, 'currentTarget')).toBe(false);
		r.unmount();
	});
});
