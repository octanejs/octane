import { describe, it, expect, vi } from 'vitest';
import { animate, motionValue } from 'motion';
import { createElement } from 'octane';
import { mount, nextPaint } from '../_helpers';
import {
	MVBox,
	AuthoredValueAnimation,
	ReducedAuthoredValueAnimation,
	ReboundValueAnimation,
	ReboundRootAnimation,
} from '../_fixtures/mv.tsrx';
import { StyleXLater } from '../_fixtures/style-rebind.tsrx';
import { StyleOpacity } from '../_fixtures/style-opacity.tsrx';
import { StyleXY } from '../_fixtures/style-xy.tsrx';
import { ControllerGroup } from '../_fixtures/controller.tsrx';
import { RetainedAuthoredValueToggle } from '../_fixtures/retained-presence.tsrx';
import { frame, type LegacyAnimationControls } from 'motion-dom';
import { removeTransformFn, patchTransformFn } from '../../src/useMotionValue';
import { motion } from '../../src/index';

describe('useMotionValue', function useMotionValueSuite() {
	it.each(['add', 'remove', 'fresh'] as const)(
		'completes an interrupted retained exit when authored MotionValue ownership changes: %s',
		async (mode) => {
			const original = motionValue(1),
				fresh = motionValue(0.7),
				record = vi.fn();
			const props = { original, fresh, mode, record };
			const r = mount(RetainedAuthoredValueToggle, { ...props, show: true });
			try {
				r.update(RetainedAuthoredValueToggle, { ...props, show: false });
				await new Promise((resolve) => setTimeout(resolve, 45));
				r.click('#switch-authored-value');
				await new Promise((resolve) => setTimeout(resolve, 220));
				expect(fresh.get()).toBe(0.7);
				expect(original.get()).not.toBe(0);
				expect(record.mock.calls.map(([event]) => event)).toEqual(['owner']);
				expect(r.container.querySelector('#authored-exit')).toBeNull();
			} finally {
				r.unmount();
			}
		},
	);

	it('keeps an unrelated retained exit running when a disjoint authored value is added', async () => {
		const original = motionValue(1),
			fresh = motionValue(0.7),
			record = vi.fn();
		const props = { original, fresh, mode: 'disjoint' as const, record };
		const r = mount(RetainedAuthoredValueToggle, { ...props, show: true });
		try {
			r.update(RetainedAuthoredValueToggle, { ...props, show: false });
			await new Promise((resolve) => setTimeout(resolve, 45));
			r.click('#switch-authored-value');
			await new Promise((resolve) => setTimeout(resolve, 220));
			expect(original.get()).toBe(0);
			expect(fresh.get()).toBe(0.7);
			expect(record.mock.calls.map(([event]) => event)).toEqual(['host', 'owner']);
			expect(r.container.querySelector('#authored-exit')).toBeNull();
		} finally {
			r.unmount();
		}
	});

	it('reenters the same retained host on a replacement authored MotionValue without stale exit completion', async () => {
		const original = motionValue(1),
			fresh = motionValue(0.7),
			record = vi.fn();
		const props = { original, fresh, mode: 'fresh' as const, record };
		const r = mount(RetainedAuthoredValueToggle, { ...props, show: true });
		try {
			const host = r.find('#authored-exit');
			r.update(RetainedAuthoredValueToggle, { ...props, show: false });
			await new Promise((resolve) => setTimeout(resolve, 45));
			r.click('#switch-authored-value');
			r.update(RetainedAuthoredValueToggle, { ...props, show: true });
			await new Promise((resolve) => setTimeout(resolve, 220));
			expect(r.find('#authored-exit')).toBe(host);
			expect(fresh.get()).toBe(1);
			expect(record.mock.calls.map(([event]) => event)).toEqual(['host']);
		} finally {
			r.unmount();
		}
	});

	it('drives authored MotionValues through animation and transitionEnd on HTML and SVG hosts', async () => {
		const x = motionValue(3),
			cx = motionValue(5),
			samples: number[] = [];
		const unsubscribe = x.on('change', (value) => samples.push(value));
		let doubled!: { get(): number };
		const onReady = (derived: { get(): number }) => {
			doubled = derived;
		};
		const r = mount(AuthoredValueAnimation, { x, cx, run: false, onReady });
		try {
			r.update(AuthoredValueAnimation, { x, cx, run: true, onReady });
			await new Promise((resolve) => setTimeout(resolve, 90));
			expect(samples.some((value) => value > 3 && value < 36)).toBe(true);
			await new Promise((resolve) => setTimeout(resolve, 160));
			expect(x.get()).toBe(42);
			expect(doubled.get()).toBe(84);
			expect(cx.get()).toBe(18);
			expect(r.find('#animated-cx').getAttribute('cx')).toBe('18');
		} finally {
			unsubscribe();
			r.unmount();
		}
	});

	it('keeps a named physical completion behind its authored transitionEnd', async () => {
		const x = motionValue(0),
			completed: Array<[unknown, number]> = [];
		const variants = {
			first: { x: 0 },
			second: { x: 20, transitionEnd: { x: 42 } },
			third: { x: 20, transitionEnd: { x: 42 } },
		};
		const View = ({ label }: { label: string }) =>
			createElement(motion.div, {
				initial: false,
				style: { x },
				animate: label,
				variants,
				transition: { duration: 0.1 },
				onAnimationComplete: (definition: unknown) => completed.push([definition, x.get()]),
			});
		const r = mount(View, { label: 'first' });
		try {
			r.update(View, { label: 'second' });
			r.update(View, { label: 'third' });
			expect(completed).toEqual([['third', 0]]);
			await new Promise((resolve) => setTimeout(resolve, 220));
			expect(completed).toEqual([
				['third', 0],
				['second', 42],
			]);
		} finally {
			r.unmount();
		}
	});

	it('keeps direct SVG bindings and independent imperative attributes on their own writers', async () => {
		const x = motionValue(3),
			cx = motionValue(5);
		const r = mount(AuthoredValueAnimation, { x, cx, run: false, onReady: () => {} });
		try {
			const circle = r.find('#animated-cx');
			circle.setAttribute('r', '4');
			const unmanaged = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			unmanaged.setAttribute('r', '2');
			circle.parentElement!.append(unmanaged);
			const owned = animate(circle, { cx: 30, r: 10 }, { duration: 0.15, ease: 'linear' });
			const external = animate(unmanaged, { r: 14 }, { duration: 0.15, ease: 'linear' });
			await new Promise((resolve) => setTimeout(resolve, 65));
			expect(cx.get()).toBeGreaterThan(5);
			expect(cx.get()).toBeLessThan(30);
			await Promise.all([owned, external]);
			await nextPaint();
			expect(cx.get()).toBe(30);
			expect(circle.getAttribute('cx')).toBe('30');
			expect(circle.getAttribute('r')).toBe('10');
			expect(unmanaged.getAttribute('r')).toBe('14');
		} finally {
			r.unmount();
		}
	});

	it('preserves SVG alias winner order and independent imperative alias priority', async () => {
		const width = motionValue(2),
			loser = motionValue(2),
			x = motionValue(0);
		const View = () =>
			createElement(
				'svg',
				null,
				createElement(motion.circle, { id: 'direct-alias', 'stroke-width': width }),
				createElement(motion.circle, {
					id: 'static-alias',
					strokeWidth: loser,
					'stroke-width': 7,
					style: { x },
				}),
			);
		const r = mount(View, {});
		try {
			const direct = r.find('#direct-alias'),
				staticWinner = r.find('#static-alias');
			expect(staticWinner.getAttribute('stroke-width')).toBe('7');
			const controls = animate(direct, { strokeWidth: 10 }, { duration: 0.1 });
			x.set(4);
			await controls;
			expect(width.get()).toBe(2);
			expect(direct.getAttribute('stroke-width')).toBe('10');
			expect(staticWinner.getAttribute('stroke-width')).toBe('7');
		} finally {
			r.unmount();
		}
	});

	it('schedules controller SVG writes at the matching Motion frame phase', async () => {
		let controls!: LegacyAnimationControls;
		const cx = motionValue(5),
			samples: Array<[number, string | null]> = [];
		const r = mount(ControllerGroup, {
			rows: [],
			circle: cx,
			circleInitial: { cx: [9, 12] },
			onReady: (first: LegacyAnimationControls) => (controls = first),
		});
		try {
			const circle = r.find('#circle');
			const sample = () => samples.push([cx.get(), circle.getAttribute('cx')]);
			await new Promise<void>((resolve) =>
				frame.update(() => {
					controls.set({ cx: 10 });
					sample();
					frame.postRender(() => {
						sample();
						resolve();
					});
				}),
			);
			await new Promise<void>((resolve) =>
				frame.postRender(() => {
					controls.set({ cx: 20 });
					sample();
					frame.postRender(() => {
						sample();
						resolve();
					});
				}),
			);
			expect(samples).toEqual([
				[10, '9'],
				[10, '10'],
				[20, '10'],
				[20, '20'],
			]);
		} finally {
			r.unmount();
		}
	});

	it('suppresses a canceled transitionEnd and rebinds a fresh authored value', async () => {
		const original = motionValue(3),
			fresh = motionValue(9),
			cx = motionValue(5);
		const onReady = () => {};
		const r = mount(AuthoredValueAnimation, { x: original, cx, run: false, onReady });
		try {
			r.update(AuthoredValueAnimation, { x: original, cx, run: true, onReady });
			await new Promise((resolve) => setTimeout(resolve, 45));
			r.update(AuthoredValueAnimation, { x: fresh, cx, run: false, onReady });
			await new Promise((resolve) => setTimeout(resolve, 220));
			expect(fresh.get()).toBe(3);
			expect(original.get()).not.toBe(42);
			fresh.set(11);
			expect(r.find('#animated-x').style.transform).toContain('translateX(11px)');
		} finally {
			r.unmount();
		}
	});

	it.each(['add', 'remove', 'fresh'] as const)(
		'cancels an unchanged declarative target when authored MotionValue ownership changes: %s',
		async (mode) => {
			const original = motionValue(0),
				fresh = motionValue(7);
			const initial = mode === 'add' ? undefined : original;
			const next = mode === 'remove' ? undefined : fresh;
			const r = mount(ReboundValueAnimation, { x: initial, run: false });
			try {
				r.update(ReboundValueAnimation, { x: initial, run: true });
				await new Promise((resolve) => setTimeout(resolve, 50));
				r.update(ReboundValueAnimation, { x: next, run: true });
				await new Promise((resolve) => setTimeout(resolve, 240));
				if (next) {
					expect(fresh.get()).toBe(7);
					expect(r.find('#rebound-x').style.transform).toContain('translateX(7px)');
				} else expect(r.find('#rebound-x').style.transform).not.toContain('120px');
				expect(original.get()).not.toBe(120);
			} finally {
				r.unmount();
			}
		},
	);

	it('preserves an independent imperative animation when adopting an authored value', async () => {
		const x = motionValue(7);
		const r = mount(ReboundValueAnimation, { run: false });
		try {
			r.update(ReboundValueAnimation, { run: true });
			const host = r.find('#rebound-x');
			const controls = animate(host, { y: 100 }, { duration: 0.3, ease: 'linear' });
			await new Promise((resolve) => setTimeout(resolve, 50));
			r.update(ReboundValueAnimation, { x, run: true });
			await new Promise((resolve) => setTimeout(resolve, 320));
			expect(x.get()).toBe(7);
			expect(host.style.transform).toContain('translateY(100px)');
			controls.stop();
		} finally {
			r.unmount();
		}
	});

	it('keeps controller and independent animations running across controller subscription replacement', async () => {
		const x = motionValue(0),
			rows = [{ id: 'one', target: 0, value: x }];
		let first!: LegacyAnimationControls;
		const onReady = (controls: LegacyAnimationControls) => {
			first = controls;
		};
		const r = mount(ControllerGroup, { rows, onReady });
		try {
			void first.start({ x: 100, transition: { duration: 0.3, ease: 'linear' } });
			const host = r.find('#one');
			const controls = animate(host, { y: 100 }, { duration: 0.3, ease: 'linear' });
			await new Promise((resolve) => setTimeout(resolve, 50));
			r.update(ControllerGroup, { rows, second: true, onReady });
			await new Promise((resolve) => setTimeout(resolve, 320));
			expect(x.get()).toBe(100);
			expect(host.style.transform).toContain('translateY(100px)');
			controls.stop();
		} finally {
			r.unmount();
		}
	});

	it('adopts an immediate SVG-root imperative animation while updating an authored attribute', async () => {
		const viewBox = motionValue('0 0 10 10'),
			x = motionValue(4);
		const r = mount(ReboundRootAnimation, { run: false });
		try {
			const host = r.find('#rebound-root');
			const controls = animate(host, { y: 'var(--target)' }, { duration: 0.25, ease: 'linear' });
			r.update(ReboundRootAnimation, { viewBox, x, run: true });
			await new Promise((resolve) => setTimeout(resolve, 100));
			const mid = Number(host.style.transform.match(/translateY\(([\d.]+)px\)/)?.[1]);
			expect(mid).toBeGreaterThan(0);
			expect(mid).toBeLessThan(100);
			await new Promise((resolve) => setTimeout(resolve, 220));
			expect(viewBox.get()).toBe('0 0 20 20');
			expect(host.getAttribute('viewBox')).toBe('0 0 20 20');
			expect(host.style.transform).toContain('translateY(var(--target))');
			expect(x.get()).toBe(4);
			r.update(ReboundRootAnimation, { viewBox: '0 0 30 30', x, run: true });
			x.set(9);
			expect(host.getAttribute('viewBox')).toBe('0 0 30 30');
			expect(host.style.transform).toContain('translateX(9px)');
			controls.stop();
		} finally {
			r.unmount();
		}
	});

	it('updates an authored public value during a focus gesture and reduced-motion animation', async () => {
		const x = motionValue(3),
			cx = motionValue(5),
			onReady = () => {};
		const r = mount(AuthoredValueAnimation, { x, cx, run: false, focus: true, onReady });
		try {
			const host = r.find('#animated-x') as HTMLElement;
			host.focus();
			await new Promise((resolve) => setTimeout(resolve, 200));
			expect(x.get()).toBe(60);
			host.blur();
			await new Promise((resolve) => setTimeout(resolve, 200));
			expect(x.get()).toBe(3);
		} finally {
			r.unmount();
		}
		const reducedX = motionValue(3),
			reducedCx = motionValue(5);
		const reduced = mount(ReducedAuthoredValueAnimation, {
			x: reducedX,
			cx: reducedCx,
			run: false,
			onReady,
		});
		try {
			reduced.update(ReducedAuthoredValueAnimation, {
				x: reducedX,
				cx: reducedCx,
				run: true,
				onReady,
			});
			await new Promise((resolve) => setTimeout(resolve, 80));
			expect(reducedX.get()).toBe(42);
		} finally {
			reduced.unmount();
		}
	});

	it('applies the resting transitionEnd after an authored-value focus gesture', async () => {
		const x = motionValue(3),
			cx = motionValue(5),
			onReady = () => {};
		const r = mount(AuthoredValueAnimation, { x, cx, run: true, focus: true, onReady });
		try {
			const host = r.find('#animated-x') as HTMLElement;
			host.focus();
			await new Promise((resolve) => setTimeout(resolve, 200));
			expect(x.get()).toBe(60);
			host.blur();
			await new Promise((resolve) => setTimeout(resolve, 200));
			expect(x.get()).toBe(42);
		} finally {
			r.unmount();
		}
	});

	it('cancels a queued instant transitionEnd when a newer target commits', async () => {
		const x = motionValue(3),
			cx = motionValue(5),
			values: number[] = [],
			onReady = () => {};
		const stop = x.on('change', (value) => values.push(value));
		const r = mount(ReducedAuthoredValueAnimation, { x, cx, run: false, onReady });
		try {
			r.update(ReducedAuthoredValueAnimation, { x, cx, run: true, onReady });
			await Promise.resolve();
			r.update(ReducedAuthoredValueAnimation, { x, cx, run: false, onReady });
			await new Promise((resolve) => setTimeout(resolve, 80));
			expect(values).not.toContain(42);
			expect(x.get()).toBe(3);
		} finally {
			stop();
			r.unmount();
		}
	});

	it('retains subscriptions when a render keeps the same MotionValue inventory', async () => {
		const x = motionValue(10);
		const subscribe = vi.spyOn(x, 'on');
		const r = mount(StyleXLater, { x });
		try {
			await nextPaint();
			const subscriptions = subscribe.mock.calls.length;
			expect(subscriptions).toBeGreaterThan(0);
			r.update(StyleXLater, { x });
			await nextPaint();
			expect(subscribe).toHaveBeenCalledTimes(subscriptions);
			x.set(20);
			expect(r.find('#box').style.transform).toBe('translateX(20px)');
		} finally {
			r.unmount();
			subscribe.mockRestore();
		}
	});

	it('binds a MotionValue to style and updates the element without a re-render', async function bindsWithoutRerender() {
		let x: any;
		const r = mount(MVBox, {
			onReady: function onReady(mv: any) {
				x = mv;
			},
		});
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.transform).toContain('translateX(0px)'); // initial
		x.set(120);
		await nextPaint();
		expect(div.style.transform).toContain('translateX(120px)'); // updated via subscription
		r.unmount();
	});

	it('keeps foreign transforms when a style MotionValue is bound later', async function keepsForeignTransformOnRebind() {
		const r = mount(StyleXLater, {});
		await nextPaint();
		const div = r.find('#box');
		// Simulate animate/layout/drag having written a transform before style bind.
		div.style.transform = 'scale(2)';

		const x = motionValue(40);
		r.update(StyleXLater, { x });
		await nextPaint();
		expect(div.style.transform).toBe('translateX(40px) scale(2)');
		r.unmount();
	});

	it('patches layout FLIP compound translate instead of stacking translateX', async function patchesLayoutCompoundTranslate() {
		const r = mount(StyleXLater, {});
		await nextPaint();
		const div = r.find('#box');
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';

		const x = motionValue(40);
		r.update(StyleXLater, { x });
		await nextPaint();
		expect(div.style.transform).toBe('translateX(40px) translateY(-50px) scale(1.2, 0.8)');
		expect(div.style.transform).not.toContain('translate(');
		r.unmount();
	});

	it('keeps a sibling axis MotionValue when patching over layout FLIP', async function keepsSiblingAxisOverLayoutFlip() {
		const x = motionValue(10);
		const y = motionValue(20);
		const r = mount(StyleXY, { x, y });
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.transform).toBe('translateX(10px) translateY(20px)');

		// Layout FLIP overwrites the live string with a compound form.
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';
		x.set(40);
		await nextPaint();
		expect(div.style.transform).toBe('translateX(40px) translateY(20px) scale(1.2, 0.8)');
		r.unmount();
	});

	it('prefers transformState sibling axes when decomposing compound translate', function prefersTransformStateSiblings() {
		const div = document.createElement('div');
		div.style.transform = 'translate(-50px, -50px)';
		patchTransformFn(div, 'x', 40, { x: 10, y: 20 });
		expect(div.style.transform).toBe('translateX(40px) translateY(20px)');
	});

	it('leaves asymmetric layout FLIP scale alone when binding uniform scale', function leavesAsymmetricFlipScaleOnUniformScale() {
		const div = document.createElement('div');
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';
		patchTransformFn(div, 'scale', 2);
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(1.2, 0.8)');
	});

	it('replaces uniform two-arg scale when binding style scale', function replacesUniformTwoArgScale() {
		const div = document.createElement('div');
		div.style.transform = 'scale(1, 1)';
		patchTransformFn(div, 'scale', 2);
		expect(div.style.transform).toBe('scale(2)');
	});

	it('decomposes asymmetric FLIP scale when binding scaleX', function decomposesAsymmetricFlipOnScaleX() {
		const div = document.createElement('div');
		div.style.transform = 'scale(1.2, 0.8)';
		patchTransformFn(div, 'scaleX', 2);
		expect(div.style.transform).toBe('scaleX(2) scaleY(0.8)');
	});

	it('clears a decomposed axis on unbind after binding over layout FLIP', function clearsDecomposedAxisOnUnbind() {
		const div = document.createElement('div');
		div.style.transform = 'translate(0px, 0px) scale(1, 1)';
		patchTransformFn(div, 'x', 40);
		expect(div.style.transform).toBe('translateX(40px) translateY(0px) scale(1, 1)');
		removeTransformFn(div, 'x');
		expect(div.style.transform).toBe('translateY(0px) scale(1, 1)');
	});

	it('leaves layout FLIP compound translate alone when unbinding x', function leavesLayoutCompoundOnUnbind() {
		const div = document.createElement('div');
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';
		removeTransformFn(div, 'x');
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(1.2, 0.8)');
		div.style.transform = 'translateX(40px) scale(2)';
		removeTransformFn(div, 'x');
		expect(div.style.transform).toBe('scale(2)');
	});

	it('leaves layout FLIP compound scale alone when unbinding scale', function leavesLayoutCompoundScaleOnUnbind() {
		const div = document.createElement('div');
		div.style.transform = 'translate(-50px, -50px) scale(1.2, 0.8)';
		removeTransformFn(div, 'scale');
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(1.2, 0.8)');
		div.style.transform = 'translate(-50px, -50px) scale(1, 1)';
		removeTransformFn(div, 'scale');
		expect(div.style.transform).toBe('translate(-50px, -50px) scale(1, 1)');
		div.style.transform = 'translateX(40px) scale(2)';
		removeTransformFn(div, 'scale');
		expect(div.style.transform).toBe('translateX(40px)');
	});

	it('keeps plain static styles when a MotionValue style key becomes static', async function keepsStaticAfterMotionValue() {
		const opacity = motionValue(0.2);
		const r = mount(StyleOpacity, { style: { opacity } });
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.opacity).toBe('0.2');

		r.update(StyleOpacity, { style: { opacity: 0.75 } });
		await nextPaint();
		expect(div.style.opacity).toBe('0.75');
		r.unmount();
	});

	it('patches and removes nested calc() transform values', async function nestedCalcTransformValues() {
		const x = motionValue('calc(100% - 10px)');
		const r = mount(StyleXLater, { x });
		await nextPaint();
		const div = r.find('#box');
		expect(div.style.transform).toContain('translateX(calc(100% - 10px))');

		x.set('calc(50% + 4px)');
		await nextPaint();
		expect(div.style.transform).toBe('translateX(calc(50% + 4px))');

		r.update(StyleXLater, {});
		await nextPaint();
		expect(div.style.transform).toBe('');
		r.unmount();
	});
});
