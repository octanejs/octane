import { motion } from '@octanejs/motion';
import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { MotionList, PlainList } from '../_fixtures/rerender.tsrx';

describe('motion host children reconcile on re-render', () => {
	it('plain <div> wrapping @for reconciles (control)', async () => {
		const r = mount(PlainList, { items: ['a', 'b', 'c'] });
		await nextPaint();
		expect(r.container.querySelectorAll('.row').length).toBe(3);
		r.update(PlainList, { items: ['a', 'b', 'c', 'd'] });
		await nextPaint();
		expect(r.container.querySelectorAll('.row').length).toBe(4);
	});

	it('keeps rendering the cached host and its children after a public property write', () => {
		const host = motion.div;
		const original = Object.getOwnPropertyDescriptor(motion, 'div');

		try {
			expect(Reflect.set(motion, 'div', () => null)).toBe(true);
			const rendered = mount(MotionList, { items: ['child'] });
			try {
				expect(rendered.find('.row').textContent).toBe('child');
			} finally {
				rendered.unmount();
			}
			expect(motion.div).toBe(host);
			expect(Reflect.deleteProperty(motion, 'div')).toBe(true);
			expect(motion.div).toBe(host);
			expect(Object.hasOwn(motion, 'div')).toBe(false);
		} finally {
			if (original) Object.defineProperty(motion, 'div', original);
			else Reflect.deleteProperty(motion, 'div');
		}
	});

	it('motion.div wrapping @for reconciles (does not duplicate)', async () => {
		const r = mount(MotionList, { items: ['a', 'b', 'c'] });
		await nextPaint();
		expect(r.container.querySelectorAll('.row').length).toBe(3);
		r.update(MotionList, { items: ['a', 'b', 'c', 'd'] });
		await nextPaint();
		expect(r.container.querySelectorAll('.row').length).toBe(4);
	});
});
