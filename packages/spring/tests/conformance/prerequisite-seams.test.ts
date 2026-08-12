import { describe, expect, it } from 'vitest';
import { raf } from '@react-spring/rafz';
import { mount, nextPaint } from '../../../motion/tests/_helpers';
import {
	// Additional upstream provenance for shared adapted evidence:
	// Per packages/animated/src/createHost.test.ts:11

	AnimatedCustomFixture,
	AnimatedHostFixture,
	AnimatedHostSurfaceFixture,
} from '../_fixtures/animated-host.tsrx';
import { SpringValue } from '../../src/index';

describe('React Spring prerequisite seams', () => {
	// Per targets/web/src/animated.test.tsx:50
	it('applies related fluid values coherently without rerendering the component', async () => {
		let values: { x: { set(value: number): void }; y: { set(value: number): void } } | undefined;
		const rendered = { count: 0 };
		const result = mount(AnimatedHostFixture, {
			onReady(next: typeof values) {
				values = next;
				rendered.count++;
			},
		});

		await nextPaint();
		const initialRenders = rendered.count;
		raf.frameLoop = 'demand';
		values!.x.set(12);
		values!.y.set(24);
		raf.advance();

		const host = result.find('#animated-host') as HTMLElement;
		expect(host.style.left).toBe('12px');
		expect(host.style.top).toBe('24px');
		expect(rendered.count).toBe(initialRenders);
		result.unmount();
		raf.frameLoop = 'always';
	});

	// Per targets/web/src/animated.test.tsx:247
	it('cancels queued host writes during unmount', async () => {
		let values: { x: { set(value: number): void } } | undefined;
		const result = mount(AnimatedHostFixture, {
			onReady(next: typeof values) {
				values = next;
			},
		});
		await nextPaint();

		raf.frameLoop = 'demand';
		values!.x.set(40);
		result.unmount();
		raf.advance();

		expect(result.container.querySelector('#animated-host')).toBe(null);
		raf.frameLoop = 'always';
	});

	// Per targets/web/src/animated.test.tsx:20
	it('mirrors the web host surface and applies one latest coherent snapshot', async () => {
		const values = {
			width: new SpringValue(10),
			opacity: new SpringValue(0.25),
			progress: new SpringValue(1),
			color: new SpringValue('rgb(255, 0, 0)'),
			x: new SpringValue(0),
			rotate: new SpringValue(0),
			scale: new SpringValue(1),
			attribute: new SpringValue('first'),
			scrollTop: new SpringValue(2),
			scrollLeft: new SpringValue(3),
		};
		const refs: Array<HTMLElement | null> = [];
		const result = mount(AnimatedHostSurfaceFixture, {
			...values,
			label: 'animated',
			className: 'box',
			hostRef: (node: HTMLElement | null) => refs.push(node),
		});
		await nextPaint();
		const node = result.find('#animated-surface') as HTMLElement;
		expect(node.style.width).toBe('10px');
		expect(node.style.opacity).toBe('0.25');
		expect(node.style.getPropertyValue('--progress')).toBe('1');
		expect(node.style.backgroundColor).toBe('rgb(255, 0, 0)');
		expect(node.style.transform).toBe('none');
		expect(node.getAttribute('aria-label')).toBe('animated');
		expect(node.getAttribute('data-fluid')).toBe('first');
		expect(node.scrollTop).toBe(2);
		expect(node.scrollLeft).toBe(3);

		raf.frameLoop = 'demand';
		values.width.set(21);
		values.opacity.set(0.75);
		values.progress.set(2);
		values.color.set('rgb(0, 0, 255)');
		values.x.set(12);
		values.rotate.set(45);
		values.scale.set(2);
		values.attribute.set('latest');
		values.scrollTop.set(8);
		values.scrollLeft.set(9);
		raf.advance();
		expect(node.style.width).toBe('21px');
		expect(node.style.transform).toContain('translate3d(12px,0,0)');
		expect(node.style.transform).toContain('rotate(45deg)');
		expect(node.style.transform).toContain('scale(2)');
		expect(node.getAttribute('data-fluid')).toBe('latest');
		expect([node.scrollTop, node.scrollLeft]).toEqual([8, 9]);
		result.unmount();
		expect(refs).toEqual([node, null]);
		raf.frameLoop = 'always';
	});

	// Per targets/web/src/animated.test.tsx:153
	it('replaces fluid dependencies and refs without retaining stale observers', async () => {
		const oldWidth = new SpringValue(10);
		const nextWidth = new SpringValue(20);
		const base = {
			opacity: 1,
			progress: 0,
			color: 'black',
			x: 0,
			rotate: 0,
			scale: 1,
			attribute: 'x',
			scrollTop: 0,
			scrollLeft: 0,
			label: 'x',
			className: 'x',
		};
		const first: Array<HTMLElement | null> = [];
		const second: Array<HTMLElement | null> = [];
		const result = mount(AnimatedHostSurfaceFixture, {
			...base,
			width: oldWidth,
			hostRef: (node: HTMLElement | null) => first.push(node),
		});
		await nextPaint();
		const node = result.find('#animated-surface') as HTMLElement;
		result.update(AnimatedHostSurfaceFixture, {
			...base,
			width: nextWidth,
			hostRef: (value: HTMLElement | null) => second.push(value),
		});
		await nextPaint();
		raf.frameLoop = 'demand';
		oldWidth.set(30);
		raf.advance();
		expect(node.style.width).toBe('20px');
		nextWidth.set(40);
		raf.advance();
		expect(node.style.width).toBe('40px');
		expect(first).toEqual([node, null]);
		expect(second).toEqual([node]);
		result.unmount();
		expect(second).toEqual([node, null]);
		raf.frameLoop = 'always';
	});

	// Per targets/web/src/animated.test.tsx:291
	it('updates static children without replacing the animated host', async () => {
		const base = {
			width: 10,
			opacity: 1,
			progress: 0,
			color: 'black',
			x: 0,
			rotate: 0,
			scale: 1,
			attribute: 'x',
			scrollTop: 0,
			scrollLeft: 0,
			label: 'x',
			className: 'x',
		};
		const result = mount(AnimatedHostSurfaceFixture, { ...base, text: 'first' });
		await nextPaint();
		const node = result.find('#animated-surface');
		result.update(AnimatedHostSurfaceFixture, { ...base, text: 'second' });
		await nextPaint();
		expect(result.find('#animated-surface')).toBe(node);
		expect(node.textContent).toBe('second');
		result.unmount();
	});

	// Per targets/web/src/animated.test.tsx:29
	it('imperatively updates ref-forwarding custom components and safely rerenders opaque ones', async () => {
		const width = new SpringValue(5);
		const value = new SpringValue('a');
		const ref = { current: null as HTMLElement | null };
		let renders = 0;
		const result = mount(AnimatedCustomFixture, {
			width,
			value,
			hostRef: ref,
			onRender: () => renders++,
		});
		await nextPaint();
		const custom = result.find('#animated-custom') as HTMLElement;
		expect(ref.current).toBe(custom);
		expect(custom.style.width).toBe('5px');
		const initialRenders = renders;
		raf.frameLoop = 'demand';
		width.set(15);
		value.set('b');
		raf.advance();
		await nextPaint();
		expect(custom.style.width).toBe('15px');
		expect(result.find('#animated-opaque').getAttribute('data-value')).toBe('b');
		expect(renders).toBe(initialRenders + 1);
		result.unmount();
		expect(ref.current).toBe(null);
		raf.frameLoop = 'always';
	});
});
