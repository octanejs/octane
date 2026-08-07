import { describe, it, expect } from 'vitest';
import { createElement, Suspense, use } from 'octane';
import { mount } from '../../octane/tests/_helpers';
import { usePrevious } from '../src/use-previous';
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

interface PreviousRadixValueProps {
	value: string | number;
	resource?: Promise<void> | null;
}

const PREVIOUS_RADIX_VALUE_SLOT = Symbol('radix-previous-value');

function PreviousRadixValue(props: PreviousRadixValueProps) {
	const previous = usePrevious<string | number>(props.value, PREVIOUS_RADIX_VALUE_SLOT);
	if (props.resource != null) use(props.resource);
	return createElement(
		'output',
		{ 'data-testid': 'previous-value' },
		Object.is(previous, -0) ? '-0' : String(previous),
	);
}

function PreviousRadixValueBoundary(props: PreviousRadixValueProps) {
	return createElement(
		Suspense,
		{ fallback: createElement('output', { 'data-testid': 'pending' }, 'pending') },
		createElement(PreviousRadixValue, props),
	);
}

describe('@octanejs/radix — previous distinct value', () => {
	it('starts at the current value and retains the previous distinct committed value', () => {
		const result = mount(PreviousRadixValueBoundary, { value: 'first' });
		try {
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('first');

			result.update(PreviousRadixValueBoundary, { value: 'second' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('first');

			result.update(PreviousRadixValueBoundary, { value: 'second' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('first');

			result.update(PreviousRadixValueBoundary, { value: 'third' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('second');
		} finally {
			result.unmount();
		}
	});

	it('does not treat positive and negative zero as distinct values', () => {
		const result = mount(PreviousRadixValueBoundary, { value: 0 });
		try {
			result.update(PreviousRadixValueBoundary, { value: -0 });
			result.update(PreviousRadixValueBoundary, { value: 1 });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('0');
		} finally {
			result.unmount();
		}
	});

	it('does not publish previous-value history from an abandoned Suspense render', () => {
		const pending = new Promise<void>(() => {});
		const result = mount(PreviousRadixValueBoundary, { value: 'committed' });
		try {
			result.update(PreviousRadixValueBoundary, { value: 'abandoned', resource: pending });
			result.update(PreviousRadixValueBoundary, { value: 'replacement', resource: null });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('committed');
		} finally {
			result.unmount();
		}
	});
});
