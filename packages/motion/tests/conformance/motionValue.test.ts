import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { MVBox } from '../_fixtures/mv.tsrx';

describe('useMotionValue', () => {
	it('binds a MotionValue to style and updates the element without a re-render', async () => {
		let x: any;
		const r = mount(MVBox, { onReady: (mv: any) => (x = mv) });
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.transform).toContain('translateX(0px)'); // initial
		x.set(120);
		await nextPaint();
		expect(div.style.transform).toContain('translateX(120px)'); // updated via subscription
		r.unmount();
	});
});
