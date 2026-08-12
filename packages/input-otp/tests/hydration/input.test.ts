import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../../octane/tests/_helpers';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr';
import { HydrationInput } from './_fixture.tsrx';

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushEffects();
	flushSync(() => {});
}

let serverHtml: string;

beforeAll(async () => {
	serverHtml = (
		await renderHydrationFixture(
			'input-otp',
			'packages/input-otp/tests/hydration/_fixture.tsrx',
			'HydrationInput',
		)
	).html;
});

describe('@octanejs/input-otp hydration and cleanup', () => {
	it('adopts the server input and remains editable', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHtml;
		document.body.appendChild(container);
		const serverInput = container.querySelector('input') as HTMLInputElement;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, HydrationInput);
		settle();
		const hydratedInput = container.querySelector('input') as HTMLInputElement;
		expect(hydratedInput).toBe(serverInput);
		expect(error).not.toHaveBeenCalled();
		hydratedInput.value = '123';
		hydratedInput.dispatchEvent(new Event('input', { bubbles: true }));
		settle();
		expect(hydratedInput.value).toBe('123');
		expect(container.querySelector('[data-testid="hydrated-value"]')?.textContent).toBe('123');
		root.unmount();
		error.mockRestore();
		container.remove();
	});

	it('removes selection listeners, disconnects observers, and clears timers on unmount', () => {
		vi.useFakeTimers();
		const originalAdd = document.addEventListener.bind(document);
		const originalRemove = document.removeEventListener.bind(document);
		let selectionAdds = 0;
		let selectionRemoves = 0;
		vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
			if (type === 'selectionchange') selectionAdds++;
			originalAdd(type, listener, options);
		});
		vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
			if (type === 'selectionchange') selectionRemoves++;
			originalRemove(type, listener, options);
		});
		const observers: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
		const OriginalResizeObserver = globalThis.ResizeObserver;
		globalThis.ResizeObserver = class {
			disconnect = vi.fn();
			constructor() {
				observers.push(this);
			}
			observe() {}
			unobserve() {}
		} as unknown as typeof ResizeObserver;

		const container = document.createElement('div');
		container.innerHTML = serverHtml;
		document.body.appendChild(container);
		const root = hydrateRoot(container, HydrationInput);
		settle();
		const input = container.querySelector('input') as HTMLInputElement;
		const elementFromPoint = vi.fn(() => container.querySelector('[data-input-otp-container]'));
		Object.defineProperty(document, 'elementFromPoint', {
			configurable: true,
			value: elementFromPoint,
		});
		input.focus();
		settle();
		vi.advanceTimersByTime(0);
		settle();
		expect(elementFromPoint).toHaveBeenCalledTimes(1);
		input.blur();
		settle();
		vi.advanceTimersByTime(2000);
		settle();
		vi.advanceTimersByTime(3000);
		settle();
		vi.advanceTimersByTime(1000);
		settle();
		expect(elementFromPoint).toHaveBeenCalledTimes(1);
		input.focus();
		settle();
		vi.advanceTimersByTime(0);
		settle();
		expect(elementFromPoint).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(2000);
		settle();
		expect(elementFromPoint).toHaveBeenCalledTimes(3);
		vi.advanceTimersByTime(3000);
		settle();
		expect(elementFromPoint).toHaveBeenCalledTimes(4);
		vi.advanceTimersByTime(1000);
		settle();
		expect(elementFromPoint).toHaveBeenCalledTimes(4);
		expect(selectionAdds).toBe(1);
		expect(vi.getTimerCount()).toBeGreaterThan(0);
		expect(observers.length).toBeGreaterThan(0);
		root.unmount();
		settle();
		const callsAtUnmount = elementFromPoint.mock.calls.length;
		vi.runAllTimers();
		settle();
		vi.runAllTimers();
		expect(selectionRemoves).toBeGreaterThanOrEqual(selectionAdds);
		expect(observers.every((observer) => observer.disconnect.mock.calls.length >= 1)).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		expect(elementFromPoint).toHaveBeenCalledTimes(callsAtUnmount);
		expect(document.getElementById('input-otp-style')).toBeNull();

		vi.restoreAllMocks();
		delete (document as { elementFromPoint?: unknown }).elementFromPoint;
		globalThis.ResizeObserver = OriginalResizeObserver;
		vi.useRealTimers();
		container.remove();
	});
});
