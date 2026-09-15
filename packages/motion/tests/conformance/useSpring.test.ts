import { describe, it, expect, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { motionValue, type MotionValue } from 'motion';
import { SpringBox } from '../_fixtures/spring.tsrx';

describe('useSpring', () => {
	it('preserves units while a string source animates and supports immediate jumps', async () => {
		const source = motionValue('10%');
		let output!: MotionValue<string>;
		const r = mount(SpringBox, {
			source,
			options: { stiffness: 1000, damping: 50 },
			onReady: (value: MotionValue<string>) => {
				output = value;
			},
		});
		try {
			await nextPaint();
			expect(output.get()).toBe('10%');
			source.set('25%');
			await vi.waitFor(() => expect(output.get()).toBe('25%'), { timeout: 2000 });
			output.jump('40%');
			expect(output.get()).toBe('40%');
		} finally {
			r.unmount();
		}
	});

	it('emits start and completion events while settling at the source target', async () => {
		const source = motionValue(0);
		let output!: MotionValue<number>;
		const r = mount(SpringBox, {
			source,
			options: { stiffness: 1000, damping: 50 },
			onReady: (value: MotionValue<number>) => {
				output = value;
			},
		});
		try {
			await nextPaint();
			const started = vi.fn();
			const completed = vi.fn();
			output.on('animationStart', started);
			output.on('animationComplete', completed);
			source.set(20);
			await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
			await vi.waitFor(() => expect(completed).toHaveBeenCalledOnce(), { timeout: 2000 });
			expect(output.get()).toBe(20);
		} finally {
			r.unmount();
		}
	});

	it('rebinds to a replacement source and removes the old subscription', async () => {
		const first = motionValue(10);
		const second = motionValue(20);
		const options = { skipInitialAnimation: true };
		let output!: MotionValue<number>;
		const onReady = (value: MotionValue<number>) => {
			output = value;
		};
		const r = mount(SpringBox, { source: first, options, onReady });
		try {
			await nextPaint();
			const identity = output;
			r.update(SpringBox, { source: second, options, onReady });
			await nextPaint();
			expect(output).toBe(identity);
			first.set(99);
			expect(output.get()).toBe(10);
			second.set(30);
			expect(output.get()).toBe(30);
		} finally {
			r.unmount();
		}
		await nextPaint();
		second.set(40);
		expect(output.get()).toBe(30);
	});

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
