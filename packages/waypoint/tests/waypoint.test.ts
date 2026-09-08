import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import {
	ABOVE,
	BELOW,
	INSIDE,
	INVISIBLE,
	Waypoint,
	findScrollableAncestor,
	getBounds,
	getCurrentPosition,
	parseOffset,
	resolveScrollableAncestorProp,
} from '../src';
import { ChildProbe, WaypointProbe } from './_fixtures/probes.tsrx';

function rect(top: number, bottom: number, left = 0, right = 100): DOMRect {
	return {
		top,
		bottom,
		left,
		right,
		width: right - left,
		height: bottom - top,
		x: left,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

beforeEach(() => {
	vi.useFakeTimers();
	Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100 });
});

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe('geometry', () => {
	it('converts pixel and percentage offsets', () => {
		expect(parseOffset(12, 200)).toBe(12);
		expect(parseOffset('25%', 200)).toBe(50);
		expect(parseOffset('18px', 200)).toBe(18);
	});

	it('classifies a zero-height viewport as invisible', () => {
		expect(
			getCurrentPosition({
				waypointTop: 0,
				waypointBottom: 0,
				viewportTop: 0,
				viewportBottom: 0,
			}),
		).toBe(INVISIBLE);
	});

	it('classifies above, inside, and below bounds', () => {
		expect(
			getCurrentPosition({
				waypointTop: -20,
				waypointBottom: -1,
				viewportTop: 0,
				viewportBottom: 100,
			}),
		).toBe(ABOVE);
		expect(
			getCurrentPosition({
				waypointTop: 20,
				waypointBottom: 40,
				viewportTop: 0,
				viewportBottom: 100,
			}),
		).toBe(INSIDE);
		expect(
			getCurrentPosition({
				waypointTop: 101,
				waypointBottom: 120,
				viewportTop: 0,
				viewportBottom: 100,
			}),
		).toBe(BELOW);
	});

	it('applies window-relative percentage offsets', () => {
		const node = document.createElement('div');
		node.getBoundingClientRect = () => rect(20, 40);
		expect(getBounds(node, window, { topOffset: '10%', bottomOffset: '20%' })).toEqual({
			waypointTop: 20,
			waypointBottom: 40,
			viewportTop: 10,
			viewportBottom: 80,
		});
	});

	it('sizes non-window ancestors with offsetWidth/offsetHeight for percentage offsets', () => {
		const node = document.createElement('div');
		node.getBoundingClientRect = () => rect(20, 40);
		const ancestor = document.createElement('div');
		Object.defineProperty(ancestor, 'offsetHeight', { configurable: true, value: 200 });
		Object.defineProperty(ancestor, 'offsetWidth', { configurable: true, value: 200 });
		ancestor.getBoundingClientRect = () => ({
			top: 50,
			left: 50,
			bottom: 150,
			right: 150,
			width: 100,
			height: 100,
			x: 50,
			y: 50,
			toJSON() {
				return {};
			},
		});
		expect(getBounds(node, ancestor, { topOffset: '10%', bottomOffset: '20%' })).toEqual({
			waypointTop: 20,
			waypointBottom: 40,
			viewportTop: 70,
			viewportBottom: 210,
		});
	});

	it('uses window for body and document scrolling', () => {
		const node = document.createElement('div');
		document.body.append(node);
		document.body.style.overflowY = 'scroll';
		expect(findScrollableAncestor(node)).toBe(window);
		document.body.style.overflowY = '';
	});

	it('resolves the string window ancestor prop to window', () => {
		expect(resolveScrollableAncestorProp('window')).toBe(window);
		expect(resolveScrollableAncestorProp(window)).toBe(window);
		const element = document.createElement('div');
		expect(resolveScrollableAncestorProp(element)).toBe(element);
	});
});

describe('Waypoint', () => {
	it('exposes the upstream position statics', () => {
		expect(Waypoint.above).toBe(ABOVE);
		expect(Waypoint.below).toBe(BELOW);
		expect(Waypoint.inside).toBe(INSIDE);
		expect(Waypoint.invisible).toBe(INVISIBLE);
	});

	it('reports initial entry and leaves on scroll', () => {
		const onEnter = vi.fn();
		const onLeave = vi.fn();
		const onPositionChange = vi.fn();
		const result = mount(WaypointProbe, { onEnter, onLeave, onPositionChange });
		flushEffects();
		const marker = result.find('span');
		let markerRect = rect(20, 40);
		marker.getBoundingClientRect = () => markerRect;
		vi.runAllTimers();
		expect(onEnter).toHaveBeenCalledWith(
			expect.objectContaining({ currentPosition: INSIDE, previousPosition: undefined }),
		);
		expect(onPositionChange).toHaveBeenCalledWith(
			expect.objectContaining({ currentPosition: INSIDE, previousPosition: undefined }),
		);

		markerRect = rect(-40, -20);
		window.dispatchEvent(new Event('scroll'));
		expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ currentPosition: ABOVE }));
		expect(onPositionChange).toHaveBeenCalledTimes(2);
		result.unmount();
	});

	it('accepts scrollableAncestor="window" for SSR-safe window targeting', () => {
		const onEnter = vi.fn();
		const onLeave = vi.fn();
		const result = mount(WaypointProbe, {
			onEnter,
			onLeave,
			onPositionChange: vi.fn(),
			scrollableAncestor: 'window',
		});
		flushEffects();
		const marker = result.find('span');
		let markerRect = rect(20, 40);
		marker.getBoundingClientRect = () => markerRect;
		vi.runAllTimers();
		expect(onEnter).toHaveBeenCalledOnce();

		markerRect = rect(-40, -20);
		window.dispatchEvent(new Event('scroll'));
		expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ currentPosition: ABOVE }));
		result.unmount();
	});

	it('synthesizes enter and leave when a scroll skips across the viewport', () => {
		const onEnter = vi.fn();
		const onLeave = vi.fn();
		const result = mount(WaypointProbe, {
			onEnter,
			onLeave,
			onPositionChange: vi.fn(),
		});
		flushEffects();
		const marker = result.find('span');
		let markerRect = rect(120, 140);
		marker.getBoundingClientRect = () => markerRect;
		vi.runAllTimers();
		markerRect = rect(-40, -20);
		window.dispatchEvent(new Event('scroll'));
		expect(onEnter).toHaveBeenCalledWith(expect.objectContaining({ currentPosition: INSIDE }));
		expect(onLeave).toHaveBeenCalledWith(expect.objectContaining({ currentPosition: ABOVE }));
		result.unmount();
	});

	it('clones a single child and attaches the measurement ref', () => {
		const onEnter = vi.fn();
		const result = mount(ChildProbe, { onEnter });
		flushEffects();
		const child = result.find('[data-testid="child"]');
		child.getBoundingClientRect = () => rect(20, 40);
		vi.runAllTimers();
		expect(onEnter).toHaveBeenCalledOnce();
		result.unmount();
	});

	it('keeps a cloned child ref attached across updates', () => {
		const onEnter = vi.fn();
		const childRef = vi.fn();
		const result = mount(ChildProbe, { onEnter, childRef, label: 'first' });
		flushEffects();
		const child = result.find('[data-testid="child"]');
		expect(childRef).toHaveBeenCalledTimes(1);
		expect(childRef).toHaveBeenLastCalledWith(child);

		result.update(ChildProbe, { onEnter, childRef, label: 'second' });
		flushEffects();
		expect(childRef).toHaveBeenCalledTimes(1);

		result.unmount();
		expect(childRef).toHaveBeenLastCalledWith(null);
	});

	it('remeasures after an update when layout moves without scrolling', () => {
		const onEnter = vi.fn();
		const result = mount(ChildProbe, { onEnter, label: 'first' });
		flushEffects();
		const child = result.find('[data-testid="child"]');
		let childRect = rect(120, 140);
		child.getBoundingClientRect = () => childRect;
		vi.runAllTimers();
		expect(onEnter).not.toHaveBeenCalled();

		childRect = rect(20, 40);
		result.update(ChildProbe, { onEnter, label: 'second' });
		flushEffects();
		vi.runAllTimers();
		expect(onEnter).toHaveBeenCalledOnce();
		result.unmount();
	});

	it('does not re-fire onEnter when the measured host remounts still inside', () => {
		const onEnter = vi.fn();
		const result = mount(ChildProbe, { onEnter, hostKey: 'a' });
		flushEffects();
		const first = result.find('[data-testid="child"]');
		first.getBoundingClientRect = () => rect(20, 40);
		vi.runAllTimers();
		expect(onEnter).toHaveBeenCalledOnce();

		result.update(ChildProbe, { onEnter, hostKey: 'b' });
		flushEffects();
		const second = result.find('[data-testid="child"]');
		second.getBoundingClientRect = () => rect(20, 40);
		vi.runAllTimers();
		expect(onEnter).toHaveBeenCalledOnce();
		result.unmount();
	});
});
