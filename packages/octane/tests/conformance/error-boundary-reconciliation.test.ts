import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import {
	SameTypeFallback,
	DifferentTypeFallback,
} from './_fixtures/error-boundary-reconciliation.tsrx';

// Ports of ErrorBoundaryReconciliation-test.internal.js (React 19.2.7).
//
// React's class-boundary split (componentDidCatch vs getDerivedStateFromError,
// :73/:76 vs :79/:82) collapses in octane: `@catch` is the single boundary
// surface, so each pair maps onto one `@try`/`@catch` test.
//
// On node identity: React deliberately does NOT reuse the errored children's
// host nodes when the boundary recovers — even when the fallback renders the
// SAME host type. See ReactFiberBeginWork.js `forceUnmountCurrentAndReconcile`:
// "the normal children and the children that are shown on error are two
// different sets, so we shouldn't reuse children even if their identities
// match". Octane matches the outcome: switching to the @catch arm unmounts the
// try body's block and mounts the fallback fresh, so the fallback element is a
// NEW node in both the same-type and different-type cases.

describe('error boundary reconciliation — fallback vs errored content', () => {
	// Per ErrorBoundaryReconciliation-test.internal.js:73 — 'componentDidCatch can
	// recover by rendering an element of the same type' (and :79, the
	// getDerivedStateFromError variant).
	it('recovers by rendering a fallback element of the same host type (fresh node)', () => {
		const r = mount(SameTypeFallback, { fail: false });
		const before = r.find('.inner');
		expect(before.tagName).toBe('SPAN');
		expect(before.getAttribute('data-prop')).toBe('BrokenRender');

		r.update(SameTypeFallback, { fail: true });

		const after = r.find('.inner');
		expect(after.tagName).toBe('SPAN');
		expect(after.getAttribute('data-prop')).toBe('ErrorBoundary');
		expect(after.textContent).toBe('ErrorBoundary');
		// Exactly one .inner remains — the errored content is gone.
		expect(r.findAll('.inner')).toHaveLength(1);
		// React remounts the fallback even for a same-type element
		// (forceUnmountCurrentAndReconcile) — the DOM node must be fresh.
		expect(after).not.toBe(before);
		r.unmount();
	});

	// Per ErrorBoundaryReconciliation-test.internal.js:76 — 'componentDidCatch can
	// recover by rendering an element of a different type' (and :82, the
	// getDerivedStateFromError variant).
	it('recovers by rendering a fallback element of a different host type (remount)', () => {
		const r = mount(DifferentTypeFallback, { fail: false });
		const before = r.find('.inner');
		expect(before.tagName).toBe('SPAN');
		expect(before.getAttribute('data-prop')).toBe('BrokenRender');

		r.update(DifferentTypeFallback, { fail: true });

		const after = r.find('.inner');
		expect(after.tagName).toBe('DIV');
		expect(after.getAttribute('data-prop')).toBe('ErrorBoundary');
		expect(after.textContent).toBe('ErrorBoundary');
		expect(r.findAll('.inner')).toHaveLength(1);
		expect(after).not.toBe(before);
		r.unmount();
	});
});
