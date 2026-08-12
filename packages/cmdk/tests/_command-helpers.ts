import { flushSync } from 'octane';
import { flushEffects } from '../../octane/tests/_helpers';

export async function settle(): Promise<void> {
	flushEffects();
	flushSync(() => {});
	await new Promise(function (resolve) {
		setTimeout(resolve, 0);
	});
	flushEffects();
	flushSync(() => {});
}

/**
 * Ranked order as the user sees it. `sort()` no longer relocates DOM nodes —
 * it assigns CSS `order` inside a flex container — so the visible sequence is
 * source order re-sorted by that property, and DOM order stays source order.
 */
export function inVisualOrder<T extends Element>(elements: T[]): T[] {
	return elements
		.map(function (el, index) {
			return {
				el,
				index,
				order: Number((el as unknown as HTMLElement).style.order) || 0,
			};
		})
		.sort(function (a, b) {
			return a.order - b.order || a.index - b.index;
		})
		.map(function (entry) {
			return entry.el;
		});
}

export function typeInput(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function press(el: Element, key: string): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

export function pressAlt(el: Element, key: string): void {
	el.dispatchEvent(
		new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }),
	);
}
