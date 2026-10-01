import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-viewport-width';
const listeners = new Set<unknown>();
const intervals = new Set<unknown>();

function resizeTo(width: number) {
	Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
	window.dispatchEvent(new Event('resize'));
}

beforeEach(() => {
	// jsdom drives requestAnimationFrame with an interval; keep frames out of the
	// interval ledger so it records only intervals the submission starts.
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
		setTimeout(() => callback(performance.now()), 0),
	);
	vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
	Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
	const addEventListener = window.addEventListener.bind(window);
	const removeEventListener = window.removeEventListener.bind(window);
	vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
		if (type === 'resize') listeners.add(listener);
		addEventListener(type, listener, options);
	});
	vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
		if (type === 'resize') listeners.delete(listener);
		removeEventListener(type, listener, options);
	});
	const setInterval = window.setInterval.bind(window);
	const clearInterval = window.clearInterval.bind(window);
	vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler, delay?: number) => {
		const id = setInterval(handler, delay);
		intervals.add(id);
		return id;
	}) as typeof window.setInterval);
	vi.spyOn(window, 'clearInterval').mockImplementation((id?: number) => {
		intervals.delete(id);
		clearInterval(id);
	});
});
afterEach(() => {
	cleanup();
	for (const id of intervals) window.clearInterval(id as number);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	listeners.clear();
	intervals.clear();
});

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders a width of 1024 without reading the browser', () => {
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
		expect(serverHTML(submissionSource(TASK))).toContain('Width: 1024px');
	});

	it('follows window resizes and releases every subscription on unmount', async () => {
		const { App } =
			await import('@octane-eval-submission/octane.strong-viewport-width/src/App.tsrx');
		const view = render(App);
		expect(view.container.textContent).toBe('Width: 800px');

		await act(async () => resizeTo(640));
		expect(view.container.textContent).toBe('Width: 640px');
		await act(async () => resizeTo(720));
		expect(view.container.textContent).toBe('Width: 720px');

		view.unmount();
		expect(listeners.size).toBe(0);
		expect(intervals.size).toBe(0);
	});
});
