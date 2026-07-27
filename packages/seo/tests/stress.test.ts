// Client-side stress: deep nesting, churn, mount/unmount cycling, and two
// siblings racing for one identity. The invariant throughout is that
// document.head holds exactly one tag per identity and converges on the last
// registration, with no accumulation and no leaks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { Churn, DeeplyNested, SameKeyTwice, Toggling } from './_fixtures/stress.tsrx';

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let error: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	document.head.innerHTML = '';
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	error = vi.spyOn(console, 'error').mockImplementation(() => {});
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	try {
		root.unmount();
	} catch {
		// A failed render may leave nothing to unmount.
	}
	container.remove();
	document.head.innerHTML = '';
	error.mockRestore();
	warn.mockRestore();
});

const titles = () => Array.from(document.head.querySelectorAll('title')).map((t) => t.textContent);
const metaOf = (name: string) =>
	document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
const click = (id: string) => {
	container.querySelector<HTMLButtonElement>('#' + id)!.click();
	settle();
};

describe('deep nesting', () => {
	it('lets the deepest block win with one tag and no diagnostics', () => {
		root.render(DeeplyNested);
		settle();
		expect(titles()).toEqual(['depth-5']);
		// Nested blocks are grouping, so none of them is a second owner.
		expect(error.mock.calls).toEqual([]);
		expect(warn.mock.calls).toEqual([]);
	});
});

describe('rapid churn of one identity', () => {
	it('converges after many updates without accumulating tags', () => {
		root.render(Churn);
		settle();
		for (let i = 0; i < 25; i++) click('bump');

		expect(document.title).toBe('n=25');
		expect(titles()).toHaveLength(1);
		expect(metaOf('description')).toBe('d=25');
		expect(document.head.querySelectorAll('meta')).toHaveLength(1);
		expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
		expect(
			document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href'),
		).toBe('/n/25');
	});

	it('keeps the adopted element identity across churn', () => {
		root.render(Churn);
		settle();
		const title = document.head.querySelector('title');
		for (let i = 0; i < 10; i++) click('bump');
		expect(document.head.querySelector('title')).toBe(title);
	});
});

describe('a block cycling in and out', () => {
	it('restores the underlying value each time it leaves', () => {
		root.render(Toggling);
		settle();
		expect(document.title).toBe('base');
		expect(metaOf('robots')).toBeNull();

		for (let i = 0; i < 8; i++) {
			click('toggle');
			expect(document.title).toBe('overlay');
			expect(metaOf('robots')).toBe('noindex, follow');
			expect(titles()).toHaveLength(1);

			click('toggle');
			expect(document.title).toBe('base');
			expect(metaOf('robots')).toBeNull();
			expect(titles()).toHaveLength(1);
		}
		// The sibling's own description was never disturbed.
		expect(metaOf('description')).toBe('base description');
	});
});

describe('two siblings claiming one identity', () => {
	it('emits one tag and keeps the later registration', () => {
		root.render(SameKeyTwice);
		settle();
		expect(titles()).toEqual(['second']);
		expect(metaOf('description')).toBe('b');
		expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
	});
});

describe('teardown', () => {
	it('leaves the head exactly as it found it', () => {
		const before = document.head.innerHTML;
		root.render(DeeplyNested);
		settle();
		expect(document.head.querySelectorAll('title')).toHaveLength(1);
		root.unmount();
		settle();
		expect(document.head.innerHTML).toBe(before);
	});
});
