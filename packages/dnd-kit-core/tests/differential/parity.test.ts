/**
 * The same authored fixture runs through @octanejs/dnd-kit-core and the
 * published @dnd-kit/core@6.3.1 on React. Every step of each drag must leave
 * equivalent DOM: draggable transforms and ARIA attributes, droppable state,
 * the DragOverlay and its drop-animation clone, the screen-reader instructions
 * and live region, monitor events, and the final placement.
 *
 * Both runtimes share one document, so the sensors' document listeners hear
 * the same dispatched events. Activation events go to each runtime's own
 * draggable; follow-up events are dispatched once, on the document.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { flushSync } from 'octane';
import { act as reactAct } from 'react';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig';
import type { DiffMount } from '../../../octane/tests/differential/_rig';

const fixture = resolve(__dirname, '../_fixtures/differential.tsrx');
const cache = resolve(__dirname, '.react-cache');

await preloadDifferentialFixture(fixture, cache);

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

function indexAmong(element: Element, tagName: string): number {
	const siblings = element.parentElement ? Array.from(element.parentElement.children) : [];
	return siblings.filter((sibling) => sibling.tagName === tagName).indexOf(element);
}

/**
 * A deterministic layout: a tray of cards across the top, drop zones side by
 * side below it, and fixed-position overlays where their inline style puts them.
 */
function box(element: Element): Box {
	const style = (element as HTMLElement).style;
	if (style?.position === 'fixed') {
		return {
			x: parseFloat(style.left),
			y: parseFloat(style.top),
			width: parseFloat(style.width),
			height: parseFloat(style.height),
		};
	}
	if (element.tagName === 'SECTION') {
		return { x: indexAmong(element, 'SECTION') * 400, y: 200, width: 300, height: 200 };
	}
	if (element.tagName === 'BUTTON' && element.parentElement?.tagName === 'NAV') {
		return { x: indexAmong(element, 'BUTTON') * 100, y: 0, width: 80, height: 30 };
	}
	if (element.tagName === 'BUTTON' && element.parentElement?.tagName === 'SECTION') {
		const zone = box(element.parentElement);
		return {
			x: zone.x + 10 + indexAmong(element, 'BUTTON') * 90,
			y: zone.y + 10,
			width: 80,
			height: 30,
		};
	}
	return { x: 0, y: 0, width: 1024, height: 768 };
}

function layout(this: Element): DOMRect {
	const { x, y, width, height } = box(this);
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

/** Fixed overlays report a parseable matrix, so the drop animation runs. */
function computedStyle(original: typeof window.getComputedStyle) {
	return function (element: Element, pseudo?: string | null): CSSStyleDeclaration {
		const style = original.call(window, element, pseudo);
		if ((element as HTMLElement).style?.position !== 'fixed') return style;
		return new Proxy(style, {
			get(target, property) {
				if (property === 'transform') return 'matrix(1, 0, 0, 1, 0, 0)';
				const value = Reflect.get(target, property, target);
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});
	};
}

async function dispatch(target: EventTarget, event: Event): Promise<void> {
	await reactAct(async () => {
		flushSync(() => {
			target.dispatchEvent(event);
		});
	});
}

function pointer(type: string, x: number, y: number): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		isPrimary: true,
		button: 0,
		buttons: type === 'pointerup' ? 0 : 1,
		clientX: x,
		clientY: y,
		pointerId: 1,
	});
}

function mouse(type: string, x: number, y: number): MouseEvent {
	return new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		clientX: x,
		clientY: y,
	});
}

function keyboard(code: string): KeyboardEvent {
	return new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true });
}

function text(mount: DiffMount, selector: string): string | null {
	return mount.find(selector).textContent;
}

beforeEach(() => {
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(layout);
	const original = window.getComputedStyle;
	vi.spyOn(window, 'getComputedStyle').mockImplementation(computedStyle(original));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('differential: @octanejs/dnd-kit-core vs @dnd-kit/core@6.3.1', () => {
	// @parity-case differential:dnd-kit-core-pointer-overlay-drop-animation
	it('matches a pointer drag through a DragOverlay and its drop animation', async () => {
		const comparison = await mountDifferential(fixture, 'PointerOverlayBoard', undefined, cache);
		await comparison.step('mount', () => {});
		await comparison.step('press card a', async (octane, react) => {
			await dispatch(octane.find('#card-a'), pointer('pointerdown', 40, 15));
			await dispatch(react.find('#card-a'), pointer('pointerdown', 40, 15));
		});
		await comparison.step('move toward the left zone', async () => {
			await dispatch(document, pointer('pointermove', 120, 260));
		});
		await comparison.step('move over the right zone', async () => {
			await dispatch(document, pointer('pointermove', 550, 300));
		});
		await comparison.step('release', async () => {
			await dispatch(document, pointer('pointerup', 550, 300));
		});
		expect(comparison.octane.findAll('#overlay')).toHaveLength(1);
		// The pointer sensor swallows clicks for 50 ms after a drag ends.
		await new Promise((resolve) => setTimeout(resolve, 60));
		await comparison.step('finish the drop animation', async (octane, react) => {
			await octane.click('#finish-drop');
			await react.click('#finish-drop');
		});
		expect(comparison.octane.findAll('#overlay')).toHaveLength(0);
		expect(comparison.octane.findAll('#zone-right #card-a')).toHaveLength(1);
		expect(text(comparison.octane, '#monitor')).toBe(
			'monitor|start:a|over:left|over:right|end:right',
		);
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-core-keyboard-announcements
	it('matches a keyboard drag and its screen-reader announcements', async () => {
		const comparison = await mountDifferential(fixture, 'KeyboardBoard', undefined, cache);
		await comparison.step('mount', () => {});
		await comparison.step('pick up card a', async (octane, react) => {
			await octane.keydown('#card-a', ' ', { code: 'Space' });
			await react.keydown('#card-a', ' ', { code: 'Space' });
		});
		for (let step = 0; step < 4; step++) {
			await comparison.step(`move down ${step}`, async () => {
				await dispatch(document, keyboard('ArrowDown'));
			});
		}
		await comparison.step('move right', async () => {
			await dispatch(document, keyboard('ArrowRight'));
		});
		await comparison.step('drop', async () => {
			await dispatch(document, keyboard('Space'));
		});
		expect(text(comparison.octane, '#monitor')).toMatch(/^monitor\|start:a\|.*\|end:left$/);
		expect(comparison.octane.findAll('#zone-left #card-a')).toHaveLength(1);
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-core-keyboard-cancel
	it('matches a keyboard drag cancelled with Escape', async () => {
		const comparison = await mountDifferential(fixture, 'KeyboardBoard', undefined, cache);
		await comparison.step('pick up card b', async (octane, react) => {
			await octane.keydown('#card-b', 'Enter', { code: 'Enter' });
			await react.keydown('#card-b', 'Enter', { code: 'Enter' });
		});
		await comparison.step('move right', async () => {
			await dispatch(document, keyboard('ArrowRight'));
		});
		await comparison.step('cancel', async () => {
			await dispatch(document, keyboard('Escape'));
		});
		expect(text(comparison.octane, '#monitor')).toMatch(/\|cancel$/);
		expect(comparison.octane.findAll('#zone-left #card-b')).toHaveLength(1);
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-core-mouse-custom-accessibility
	it('matches a mouse drag with custom announcements in an explicit container', async () => {
		const comparison = await mountDifferential(fixture, 'MouseBoard', undefined, cache);
		await comparison.step('mount', () => {});
		await comparison.step('press card b', async (octane, react) => {
			await dispatch(octane.find('#card-b'), mouse('mousedown', 140, 15));
			await dispatch(react.find('#card-b'), mouse('mousedown', 140, 15));
		});
		await comparison.step('move within the constraint', async () => {
			await dispatch(document, mouse('mousemove', 142, 15));
		});
		await comparison.step('move past the constraint', async () => {
			await dispatch(document, mouse('mousemove', 150, 15));
		});
		await comparison.step('move over the right zone', async () => {
			await dispatch(document, mouse('mousemove', 700, 300));
		});
		await comparison.step('release', async () => {
			await dispatch(document, mouse('mouseup', 700, 300));
		});
		expect(text(comparison.octane, '#announcer [role="status"]')).toBe('dropped on right');
		expect(comparison.octane.findAll('#zone-right #card-b')).toHaveLength(1);
		comparison.unmount();
	});
});
