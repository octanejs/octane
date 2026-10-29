/**
 * The same authored fixture runs through @octanejs/dnd-kit-modifiers and the
 * published @dnd-kit/modifiers@9.0.0 on React. Each modifier preset must
 * constrain the dragged transform identically at every step of one pointer
 * path that leaves the track in both directions.
 *
 * Both runtimes share one document, so the pointer sensors' document listeners
 * hear the same dispatched moves. Each runtime is pressed on its own handle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { flushSync } from 'octane';
import { act as reactAct } from 'react';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig';
import type { DiffPair } from '../../../octane/tests/differential/_rig';

const fixture = resolve(__dirname, '../_fixtures/differential.tsrx');
const cache = resolve(__dirname, '.react-cache');

await preloadDifferentialFixture(fixture, cache);

/** Elements declare their layout as `data-rect="x,y,width,height"`. */
function layout(this: Element): DOMRect {
	const style = (this as HTMLElement).style;
	const [x, y, width, height] =
		style?.position === 'fixed'
			? [style.left, style.top, style.width, style.height].map((value) => parseFloat(value))
			: (this.getAttribute('data-rect') ?? '0,0,1024,768').split(',').map(Number);
	return {
		x,
		y,
		width,
		height,
		left: x,
		top: y,
		right: x + width,
		bottom: y + height,
		toJSON() {
			return { x, y, width, height };
		},
	} as DOMRect;
}

async function dispatch(target: EventTarget, type: string, x: number, y: number): Promise<void> {
	const event = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		isPrimary: true,
		button: 0,
		buttons: type === 'pointerup' ? 0 : 1,
		clientX: x,
		clientY: y,
		pointerId: 1,
	});
	await reactAct(async () => {
		flushSync(() => {
			target.dispatchEvent(event);
		});
	});
}

async function drag(comparison: DiffPair, selector: string): Promise<void> {
	await comparison.step('mount', () => {});
	await comparison.step('press', async (octane, react) => {
		await dispatch(octane.find(selector), 'pointerdown', 40, 40);
		await dispatch(react.find(selector), 'pointerdown', 40, 40);
	});
	await comparison.step('move down and right', async () => {
		await dispatch(document, 'pointermove', 333, 251);
	});
	await comparison.step('move up and left', async () => {
		await dispatch(document, 'pointermove', -120, -60);
	});
	await comparison.step('move past the window edge', async () => {
		await dispatch(document, 'pointermove', 1300, 900);
	});
	await comparison.step('release', async () => {
		await dispatch(document, 'pointerup', 1300, 900);
	});
}

beforeEach(() => {
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(layout);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('differential: @octanejs/dnd-kit-modifiers vs @dnd-kit/modifiers@9.0.0', () => {
	// @parity-case differential:dnd-kit-modifiers-horizontal-scrollable
	it('restricts to the horizontal axis and the first scrollable ancestor', async () => {
		const comparison = await mountDifferential(
			fixture,
			'ModifierBoard',
			{ preset: 'horizontal' },
			cache,
		);
		await comparison.step('mount', () => {});
		await comparison.step('press', async (octane, react) => {
			await dispatch(octane.find('#handle'), 'pointerdown', 40, 40);
			await dispatch(react.find('#handle'), 'pointerdown', 40, 40);
		});
		await comparison.step('move down and right past the scroller', async () => {
			await dispatch(document, 'pointermove', 500, 251);
		});
		// The y delta is dropped and x stops where the handle meets the scroller's edge.
		expect(comparison.octane.find('#handle').getAttribute('style')).toBe(
			'transform: translate3d(340px, 0px, 0);',
		);
		await comparison.step('release', async () => {
			await dispatch(document, 'pointerup', 500, 251);
		});
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-modifiers-vertical-parent
	it('restricts to the vertical axis and the parent element', async () => {
		const comparison = await mountDifferential(
			fixture,
			'ModifierBoard',
			{ preset: 'vertical' },
			cache,
		);
		await drag(comparison, '#handle');
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-modifiers-window-edges
	it('restricts to the window edges', async () => {
		const comparison = await mountDifferential(
			fixture,
			'ModifierBoard',
			{ preset: 'window' },
			cache,
		);
		await drag(comparison, '#handle');
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-modifiers-snap-grid
	it('snaps the transform to a grid', async () => {
		const comparison = await mountDifferential(fixture, 'ModifierBoard', { preset: 'snap' }, cache);
		await drag(comparison, '#handle');
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-modifiers-overlay-snap-center
	it('snaps a DragOverlay to the cursor inside the window', async () => {
		const comparison = await mountDifferential(fixture, 'OverlayModifierBoard', undefined, cache);
		await drag(comparison, '#handle');
		comparison.unmount();
	});
});
