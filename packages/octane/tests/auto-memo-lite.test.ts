import { describe, expect, it } from 'vitest';
import { mount } from './_helpers.js';
import { MemoLiteApp } from './_fixtures/auto-memo-lite.tsrx';

// The memo-guarded lite callsite: the child slot is markerless (no comp
// comment pair, no Block) and the compiler cache skips the call outright when
// its dep values are unchanged. These assertions sit on the DOM boundary —
// comment markers, element identity, MutationObserver records.
describe('memo-guarded lite component slots', () => {
	it('renders a memo-lite child markerless and skips its slot on equal deps', () => {
		const r = mount(MemoLiteApp, { tick: 'a', show: true, label: 'x' });
		try {
			const arm = r.find('.mll-arm');
			const leaf = r.find('.mll-leaf');
			expect(leaf.textContent).toBe('x');
			// Lite lowering: the slot mints no comp markers — the arm's children
			// are exactly the leaf element.
			expect(arm.childNodes.length).toBe(1);
			expect(arm.firstChild).toBe(leaf);

			const observer = new MutationObserver(() => {});
			observer.observe(arm, {
				attributes: true,
				characterData: true,
				childList: true,
				subtree: true,
			});
			// Equal dep values: the guard skips the lite call entirely — no body
			// re-run, no DOM write, same element.
			r.update(MemoLiteApp, { tick: 'b', show: true, label: 'x' });
			expect(r.find('.mll-tick').textContent).toBe('b');
			expect(r.find('.mll-leaf')).toBe(leaf);
			expect(observer.takeRecords()).toEqual([]);
			observer.disconnect();
		} finally {
			r.unmount();
		}
	});

	it('re-runs the lite slot when a dep value changes', () => {
		const r = mount(MemoLiteApp, { tick: 'a', show: true, label: 'x' });
		try {
			const leaf = r.find('.mll-leaf');
			r.update(MemoLiteApp, { tick: 'a', show: true, label: 'y' });
			expect(r.find('.mll-leaf').textContent).toBe('y');
			// The lite slot reconciles in place — same scope, same element.
			expect(r.find('.mll-leaf')).toBe(leaf);
		} finally {
			r.unmount();
		}
	});

	it('unmounts and remounts the lite slot with the conditional arm', () => {
		const r = mount(MemoLiteApp, { tick: 'a', show: true, label: 'x' });
		try {
			r.update(MemoLiteApp, { tick: 'a', show: false, label: 'x' });
			expect(r.findAll('.mll-leaf')).toEqual([]);
			r.update(MemoLiteApp, { tick: 'a', show: true, label: 'z' });
			expect(r.find('.mll-leaf').textContent).toBe('z');
		} finally {
			r.unmount();
		}
	});
});
