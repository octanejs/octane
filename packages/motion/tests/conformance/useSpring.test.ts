import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { motionValue } from 'motion';
import { SpringBox } from '../_fixtures/spring.tsrx';

describe('useSpring', () => {
	it('returns a MotionValue seeded from the initial value; jump is synchronous', async () => {
		let s: any;
		const r = mount(SpringBox, { source: 0, onReady: (mv: any) => (s = mv) });
		await nextPaint();
		expect(typeof s.get).toBe('function');
		expect(typeof s.set).toBe('function');
		expect(s.get()).toBe(0); // seeded
		s.jump(50);
		expect(s.get()).toBe(50); // jump snaps instantly
		r.unmount();
	});

	it('springs toward a set target over frames (not instantly)', async () => {
		let s: any;
		const r = mount(SpringBox, { source: 0, onReady: (mv: any) => (s = mv) });
		await nextPaint();
		s.set(100);
		expect(s.get()).not.toBe(100); // animates rather than jumping
		r.unmount();
	});

	it('follow form: seeds from a source MotionValue', async () => {
		const src = motionValue(10);
		let s: any;
		const r = mount(SpringBox, { source: src, onReady: (mv: any) => (s = mv) });
		await nextPaint();
		expect(s.get()).toBe(10); // seeded from source.get()
		r.unmount();
	});
});
