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

	it('motion.div wrapping @for reconciles (does not duplicate)', async () => {
		const r = mount(MotionList, { items: ['a', 'b', 'c'] });
		await nextPaint();
		expect(r.container.querySelectorAll('.row').length).toBe(3);
		r.update(MotionList, { items: ['a', 'b', 'c', 'd'] });
		await nextPaint();
		expect(r.container.querySelectorAll('.row').length).toBe(4);
	});
});
