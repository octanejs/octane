/**
 * The framework-free helpers of @octanejs/dnd-kit-utilities must return what
 * the published @dnd-kit/utilities@3.2.2 returns for the same inputs.
 */
import { describe, expect, it } from 'vitest';
import * as upstream from '@dnd-kit/utilities';
import * as port from '@octanejs/dnd-kit-utilities';

type Helpers = typeof port;

function both<T>(read: (helpers: Helpers) => T): [T, T] {
	return [read(port), read(upstream as unknown as Helpers)];
}

describe('differential: @octanejs/dnd-kit-utilities helpers vs @dnd-kit/utilities@3.2.2', () => {
	// @parity-case differential:dnd-kit-utilities-css
	it('serializes transforms and transitions identically', () => {
		const transforms = [
			null,
			{ x: 1.4, y: -2.6, scaleX: 1.5, scaleY: 0.5 },
			{ x: 0, y: 0, scaleX: 1, scaleY: 1 },
		];
		for (const transform of transforms) {
			for (const kind of ['Translate', 'Scale', 'Transform'] as const) {
				const [actual, expected] = both((helpers) => helpers.CSS[kind].toString(transform));
				expect(actual).toBe(expected);
			}
		}
		const [actual, expected] = both((helpers) =>
			helpers.CSS.Transition.toString({ property: 'transform', duration: 250, easing: 'ease' }),
		);
		expect(actual).toBe(expected);
	});

	// @parity-case differential:dnd-kit-utilities-adjustment
	it('adds and subtracts coordinate adjustments identically', () => {
		const origin = { x: 10, y: 20, scaleX: 1 };
		const [added, expectedAdded] = both((helpers) => helpers.add(origin, { x: 1 }, { y: 2, x: 3 }));
		const [subtracted, expectedSubtracted] = both((helpers) =>
			helpers.subtract(origin, { x: 5, y: 5 }),
		);
		expect(added).toEqual(expectedAdded);
		expect(subtracted).toEqual(expectedSubtracted);
		expect(origin).toEqual({ x: 10, y: 20, scaleX: 1 });
	});

	// @parity-case differential:dnd-kit-utilities-events
	it('classifies events and reads their coordinates identically', () => {
		const target = document.createElement('div');
		document.body.append(target);
		const events: Event[] = [
			new MouseEvent('mousedown', { clientX: 4, clientY: 8 }),
			new KeyboardEvent('keydown', { code: 'Space' }),
			new Event('custom'),
		];
		for (const event of events) {
			target.dispatchEvent(event);
			for (const read of [
				(helpers: Helpers) => helpers.getEventCoordinates(event),
				(helpers: Helpers) => helpers.hasViewportRelativeCoordinates(event),
				(helpers: Helpers) => helpers.isKeyboardEvent(event),
				(helpers: Helpers) => helpers.isTouchEvent(event),
			]) {
				const [actual, expected] = both(read);
				expect(actual).toEqual(expected);
			}
		}
		target.remove();
	});

	// @parity-case differential:dnd-kit-utilities-dom
	it('resolves windows, documents, focus targets, and node types identically', () => {
		const container = document.createElement('div');
		container.innerHTML = '<span id="text">text</span><button id="first">first</button><svg></svg>';
		document.body.append(container);
		const svg = container.querySelector('svg')!;
		const candidates: unknown[] = [window, document, container, svg, container.firstChild, {}];
		for (const candidate of candidates) {
			for (const read of [
				(helpers: Helpers) => helpers.isWindow(candidate as Window),
				(helpers: Helpers) => helpers.isDocument(candidate as Node),
				(helpers: Helpers) => helpers.isNode(candidate as Node),
				(helpers: Helpers) => helpers.isHTMLElement(candidate as Node),
				(helpers: Helpers) => helpers.isSVGElement(candidate as Node),
				(helpers: Helpers) => helpers.getWindow(candidate as EventTarget) === window,
				(helpers: Helpers) => helpers.getOwnerDocument(candidate as EventTarget) === document,
			]) {
				const [actual, expected] = both(read);
				expect(actual).toBe(expected);
			}
		}
		for (const read of [
			(helpers: Helpers) => helpers.getWindow(null) === window,
			(helpers: Helpers) => helpers.getOwnerDocument(null) === document,
		]) {
			const [actual, expected] = both(read);
			expect(actual).toBe(expected);
		}
		const [focusable, expectedFocusable] = both((helpers) =>
			helpers.findFirstFocusableNode(container),
		);
		expect(focusable).toBe(expectedFocusable);
		expect(focusable?.id).toBe('first');
		expect(port.canUseDOM).toBe(upstream.canUseDOM);
		container.remove();
	});
});
