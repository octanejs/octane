import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-measured-width';
const CHARACTER_WIDTH = 8;

// jsdom has no layout. Every element is CHARACTER_WIDTH pixels wide per
// character of its text, through each common measurement API.
function widthOf(element: Element): number {
	return (element.textContent ?? '').length * CHARACTER_WIDTH;
}

// A browser paints only after the current task and its microtasks finish. Its
// rendering step then runs animation-frame callbacks and delivers
// ResizeObserver entries for the new layout before it paints. `nextPaint()`
// performs that step and stops where the browser would paint, so a width that
// arrives later, such as from a timer, misses the frame. Like any
// testing-library render, `render()` also flushes passive effects before it
// returns, so this does not model `useEffect` timing.
const frames = new Map<number, FrameRequestCallback>();
let lastFrame = 0;
const observers = new Set<GraderResizeObserver>();

class GraderResizeObserver {
	#callback: ResizeObserverCallback;
	#targets = new Map<Element, number | undefined>();

	constructor(callback: ResizeObserverCallback) {
		this.#callback = callback;
		observers.add(this);
	}

	observe(target: Element) {
		if (!this.#targets.has(target)) this.#targets.set(target, undefined);
	}

	unobserve(target: Element) {
		this.#targets.delete(target);
	}

	disconnect() {
		this.#targets.clear();
		observers.delete(this);
	}

	deliver(): boolean {
		const entries: ResizeObserverEntry[] = [];
		for (const [target, reported] of this.#targets) {
			const width = widthOf(target);
			if (width === reported) continue;
			this.#targets.set(target, width);
			const size = [{ inlineSize: width, blockSize: 16 }];
			entries.push({
				target,
				contentRect: rect(width),
				borderBoxSize: size,
				contentBoxSize: size,
				devicePixelContentBoxSize: size,
			} as unknown as ResizeObserverEntry);
		}
		if (entries.length > 0) this.#callback(entries, this as unknown as ResizeObserver);
		return entries.length > 0;
	}
}

function rect(width: number): DOMRect {
	const box = { x: 0, y: 0, top: 0, left: 0, width, height: 16, right: width, bottom: 16 };
	return { ...box, toJSON: () => box } as DOMRect;
}

async function microtasks() {
	for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

async function nextPaint() {
	await microtasks();
	const pending = [...frames.values()];
	frames.clear();
	for (const callback of pending) {
		callback(performance.now());
		await microtasks();
	}
	for (let depth = 0; depth < 10; depth++) {
		let delivered = false;
		for (const observer of [...observers]) delivered = observer.deliver() || delivered;
		if (!delivered) break;
		await microtasks();
	}
}

beforeEach(() => {
	frames.clear();
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		frames.set(++lastFrame, callback);
		return lastFrame;
	});
	vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
	vi.stubGlobal('ResizeObserver', GraderResizeObserver);
	for (const property of ['offsetWidth', 'clientWidth', 'scrollWidth'] as const) {
		vi.spyOn(HTMLElement.prototype, property, 'get').mockImplementation(function (
			this: HTMLElement,
		) {
			return widthOf(this);
		});
	}
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
		return rect(widthOf(this));
	});
});
afterEach(() => {
	cleanup();
	observers.clear();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function caption(root: ParentNode) {
	return root.querySelector('figcaption')!.textContent;
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the text with a width of 0', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHTML(submissionSource(TASK), { text: 'Save' });
		expect(container.querySelector('span')!.textContent).toBe('Save');
		expect(caption(container)).toBe('0px wide');
	});

	it('paints the measured width from the first frame and follows text changes', async () => {
		const { App } =
			await import('@octane-eval-submission/octane.strong-measured-width/src/App.tsrx');
		const view = render(App, { props: { text: 'Save' } });
		await nextPaint();
		expect(caption(view.container)).toBe('32px wide');

		view.rerender({ props: { text: 'Save changes' } });
		await nextPaint();
		expect(caption(view.container)).toBe('96px wide');
		view.rerender({ props: { text: 'Saved' } });
		await nextPaint();
		expect(caption(view.container)).toBe('40px wide');
		expect(view.container.querySelector('span')!.textContent).toBe('Saved');
	});
});
