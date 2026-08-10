import { afterEach, vi } from 'vitest';
import { delegateEvents, flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';

delegateEvents([
	'mousedown',
	'mouseup',
	'mousemove',
	'touchstart',
	'touchmove',
	'touchend',
	'keydown',
	'keyup',
]);

const roots: Array<{ unmount: () => void }> = [];

export function mountTracked(...args: Parameters<typeof mount<any>>) {
	const root = mount<any>(...args);
	roots.push(root);
	return root;
}

export function settle() {
	flushEffects();
	flushSync(function flush() {});
}

/** Document-level pointer listeners schedule Octane updates on a microtask. */
export async function settleAsync() {
	await Promise.resolve();
	settle();
}

/** Match upstream tests/components.test.js getBoundingClientRect mock. */
export function mockPickerGeometry() {
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
		return {
			x: 5,
			y: 5,
			top: 5,
			left: 5,
			right: 105,
			bottom: 105,
			width: 100,
			height: 100,
			toJSON: function toJSON() {
				return {};
			},
		};
	});
}

export function interactive(root: { find: (sel: string) => Element }, label: string) {
	return root.find(`[aria-label="${label}"]`) as HTMLElement;
}

export function mouse(
	target: EventTarget,
	type: string,
	pageX: number,
	pageY: number,
	buttons = 1,
) {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		buttons,
		clientX: pageX,
		clientY: pageY,
	});
	Object.defineProperty(event, 'pageX', {
		configurable: true,
		get: function getPageX() {
			return pageX;
		},
	});
	Object.defineProperty(event, 'pageY', {
		configurable: true,
		get: function getPageY() {
			return pageY;
		},
	});
	target.dispatchEvent(event);
}

type TouchPoint = { pageX: number; pageY: number; identifier?: number };

function toTouchList(touches: TouchPoint[]) {
	return touches.map(function mapTouch(entry, index) {
		return {
			identifier: entry.identifier ?? index,
			pageX: entry.pageX,
			pageY: entry.pageY,
			clientX: entry.pageX,
			clientY: entry.pageY,
		};
	});
}

function dispatchTouch(
	target: EventTarget,
	type: 'touchstart' | 'touchmove' | 'touchend',
	touches: TouchPoint[],
	changedTouches: TouchPoint[],
) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		touches: { configurable: true, value: toTouchList(touches) },
		changedTouches: { configurable: true, value: toTouchList(changedTouches) },
	});
	target.dispatchEvent(event);
}

export function touchStart(
	target: Element,
	pageX: number,
	pageY: number,
	identifier = 0,
	activeTouches?: TouchPoint[],
) {
	const changed = { pageX, pageY, identifier };
	const touches = activeTouches ?? [changed];
	dispatchTouch(target, 'touchstart', touches, [changed]);
}

export function touchMove(target: EventTarget, touches: TouchPoint[]) {
	dispatchTouch(target, 'touchmove', touches, touches);
}

export function touchEnd(target: EventTarget) {
	dispatchTouch(target, 'touchend', [], []);
}

afterEach(function cleanup() {
	for (const root of roots.splice(0)) root.unmount();
	vi.restoreAllMocks();
});
