import { describe, it, expect } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { SepPlain, SepDecorative, LabelPlain, SepAsChild, SlotMerge } from './_fixtures/proof.tsx';

// @octanejs/radix Phase 0 — the composition foundation (Slot / Primitive / asChild) +
// the first proof components (Separator, Label).

describe('@octanejs/radix — Separator', () => {
	it('renders role=separator + data/aria orientation for vertical', () => {
		const r = mount(SepPlain);
		const el = r.container.querySelector('div')!;
		expect(el.getAttribute('role')).toBe('separator');
		expect(el.getAttribute('data-orientation')).toBe('vertical');
		expect(el.getAttribute('aria-orientation')).toBe('vertical');
		r.unmount();
	});

	it('decorative → role=none, horizontal default, no aria-orientation', () => {
		const r = mount(SepDecorative);
		const el = r.container.querySelector('div')!;
		expect(el.getAttribute('role')).toBe('none');
		expect(el.getAttribute('data-orientation')).toBe('horizontal');
		expect(el.getAttribute('aria-orientation')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/radix — Label', () => {
	it('renders a <label> with its class + text', () => {
		const r = mount(LabelPlain);
		const el = r.container.querySelector('label')!;
		expect(el).not.toBe(null);
		expect(el.className).toBe('lbl');
		expect(el.textContent).toBe('name');
		r.unmount();
	});
});

describe('@octanejs/radix — Slot / asChild', () => {
	it('Separator asChild projects onto the child element (no wrapper div)', () => {
		const r = mount(SepAsChild);
		// The <hr> IS the separator — no wrapper <div>.
		expect(r.container.querySelector('div')).toBe(null);
		const hr = r.container.querySelector('hr')!;
		expect(hr.getAttribute('role')).toBe('separator');
		expect(hr.getAttribute('data-orientation')).toBe('vertical');
		expect(hr.getAttribute('aria-orientation')).toBe('vertical');
		// class composes: child's own 'rule' + the separator's 'sep'.
		expect(hr.className.split(' ').sort()).toEqual(['rule', 'sep']);
		r.unmount();
	});

	it('Slot merges props onto the child, preserving the child props + children', () => {
		const r = mount(SlotMerge);
		const btn = r.container.querySelector('button')!;
		expect(btn.getAttribute('id')).toBe('merged'); // merged in
		expect(btn.getAttribute('data-slot')).toBe('yes'); // merged in
		expect(btn.getAttribute('type')).toBe('button'); // child prop preserved
		expect(btn.textContent).toBe('go'); // child children preserved
		expect(btn.className.split(' ').sort()).toEqual(['btn', 'from-slot']); // class composes
		r.unmount();
	});
});
