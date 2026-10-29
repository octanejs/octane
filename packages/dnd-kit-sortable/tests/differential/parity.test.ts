/**
 * The same authored fixture runs through @octanejs/dnd-kit-sortable and the
 * published @dnd-kit/sortable@10.0.0 on React. Every drag step must leave the
 * rendered DOM equivalent after the shared rig's normalization: row transforms
 * and transitions, ARIA attributes, the screen-reader live region, the event
 * log, and the final order.
 *
 * Both runtimes share one document, so the sensors' document listeners hear
 * the same dispatched keyboard and pointer events. Activation events go to
 * each runtime's own row; follow-up events are dispatched once, on the
 * document, and drive both drags.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { flushSync } from 'octane';
import { act as reactAct } from 'react';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig';

const fixture = resolve(__dirname, '../_fixtures/differential.tsrx');
const cache = resolve(__dirname, '.react-cache');

await preloadDifferentialFixture(fixture, cache);

/**
 * A deterministic layout: list rows stack vertically and tabs sit side by
 * side, each placed by its position among its element siblings.
 */
function layout(this: Element): DOMRect {
	const siblings = this.parentElement ? Array.from(this.parentElement.children) : [];
	const index = siblings.indexOf(this);
	let box = { x: 0, y: 0, width: 1024, height: 768 };
	if (this.tagName === 'LI') box = { x: 0, y: 100 + index * 50, width: 200, height: 40 };
	if (this.tagName === 'BUTTON') box = { x: index * 100, y: 0, width: 80, height: 30 };
	return {
		...box,
		left: box.x,
		top: box.y,
		right: box.x + box.width,
		bottom: box.y + box.height,
		toJSON() {
			return box;
		},
	} as DOMRect;
}

function order(elements: Element[]): string[] {
	return elements.map((element) => element.textContent ?? '');
}

async function dispatchToDocument(event: Event): Promise<void> {
	await reactAct(async () => {
		flushSync(() => {
			document.dispatchEvent(event);
		});
	});
}

function keyboard(code: string): KeyboardEvent {
	return new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true });
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

beforeEach(() => {
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(layout);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('differential: @octanejs/dnd-kit-sortable vs @dnd-kit/sortable@10.0.0', () => {
	// @parity-case differential:dnd-kit-sortable-keyboard-reorder
	it('matches a keyboard reorder of a vertical sortable list', async () => {
		const comparison = await mountDifferential(fixture, 'VerticalSortableList', undefined, cache);
		await comparison.step('mount', () => {});
		await comparison.step('pick up beta', async (octane, react) => {
			await octane.keydown('#row-beta', ' ', { code: 'Space' });
			await react.keydown('#row-beta', ' ', { code: 'Space' });
		});
		await comparison.step('move down', async () => {
			await dispatchToDocument(keyboard('ArrowDown'));
		});
		await comparison.step('move down again', async () => {
			await dispatchToDocument(keyboard('ArrowDown'));
		});
		await comparison.step('drop', async () => {
			await dispatchToDocument(keyboard('Space'));
		});
		expect(order(comparison.octane.findAll('#list > li'))).toEqual([
			'alpha',
			'gamma',
			'delta',
			'beta',
		]);
		expect(comparison.octane.find('#log').textContent).toBe(
			'idle|start:beta|over:beta>beta|over:beta>gamma|over:beta>delta|end:beta>delta',
		);
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-sortable-keyboard-cancel
	it('matches a keyboard drag cancelled with Escape', async () => {
		const comparison = await mountDifferential(fixture, 'VerticalSortableList', undefined, cache);
		await comparison.step('pick up gamma', async (octane, react) => {
			await octane.keydown('#row-gamma', 'Enter', { code: 'Enter' });
			await react.keydown('#row-gamma', 'Enter', { code: 'Enter' });
		});
		await comparison.step('move up', async () => {
			await dispatchToDocument(keyboard('ArrowUp'));
		});
		await comparison.step('cancel', async () => {
			await dispatchToDocument(keyboard('Escape'));
		});
		expect(order(comparison.octane.findAll('#list > li'))).toEqual([
			'alpha',
			'beta',
			'gamma',
			'delta',
		]);
		expect(comparison.octane.find('#log').textContent).toBe(
			'idle|start:gamma|over:gamma>gamma|over:gamma>beta|cancel:gamma>beta',
		);
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-sortable-pointer-reorder
	it('matches a pointer reorder of horizontal tabs past a distance constraint', async () => {
		const comparison = await mountDifferential(fixture, 'HorizontalSortableTabs', undefined, cache);
		await comparison.step('press files', async (octane, react) => {
			const press = async (button: Element) => {
				await reactAct(async () => {
					flushSync(() => {
						button.dispatchEvent(pointer('pointerdown', 40, 15));
					});
				});
			};
			await press(octane.find('#tab-files'));
			await press(react.find('#tab-files'));
		});
		await comparison.step('move within the constraint', async () => {
			await dispatchToDocument(pointer('pointermove', 43, 15));
		});
		await comparison.step('move past the constraint', async () => {
			await dispatchToDocument(pointer('pointermove', 90, 15));
		});
		await comparison.step('move over terminal', async () => {
			await dispatchToDocument(pointer('pointermove', 250, 15));
		});
		await comparison.step('release', async () => {
			await dispatchToDocument(pointer('pointerup', 250, 15));
		});
		expect(order(comparison.octane.findAll('#tabs > button'))).toEqual([
			'diff',
			'terminal',
			'files',
		]);
		expect(comparison.octane.find('#log').textContent).toBe('idle|start:files|end:files>terminal');
		comparison.unmount();
	});
});
