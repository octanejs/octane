import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { TransformBox } from '../_fixtures/transform.tsrx';

const flushFrames = async () => {
	for (let i = 0; i < 4; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
};

describe('useTransform', () => {
	it('derives values from all three forms (synchronous initial values)', async () => {
		let v: any;
		const r = mount(TransformBox, { onReady: (o: any) => (v = o) });
		await nextPaint();
		expect(v.mapped.get()).toBe(0.5); // form 2: 50 in [0,100] → [0,1]
		expect(v.doubled.get()).toBe(100); // form 1: 50 * 2
		expect(v.summed.get()).toBe(5); // form 3: 2 + 3
		expect(v.plusOne.get()).toBe(51); // form 4: single input + transformer
		r.unmount();
	});

	it('updates derived values when inputs change', async () => {
		let v: any;
		const r = mount(TransformBox, { onReady: (o: any) => (v = o) });
		await nextPaint();
		v.x.set(80);
		await flushFrames();
		expect(v.mapped.get()).toBe(0.8);
		expect(v.doubled.get()).toBe(160);
		expect(v.plusOne.get()).toBe(81); // form 4 reacts too
		v.a.set(10);
		await flushFrames();
		expect(v.summed.get()).toBe(13); // 10 + 3
		r.unmount();
	});

	it('stops updating after unmount (destroy tears down input subscriptions)', async () => {
		let v: any;
		const r = mount(TransformBox, { onReady: (o: any) => (v = o) });
		await nextPaint();
		r.unmount();
		v.x.set(999);
		await flushFrames();
		expect(v.doubled.get()).toBe(100); // unchanged — subscription destroyed
	});
});
