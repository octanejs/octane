// Client-side route changes and in-place metadata changes. This is where stale
// metadata leaks in practice: a page unmounts but its canonical or og:image
// stays behind, or a component re-renders and loses its own registration to an
// outer default.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { NavApp } from './_fixtures/nav-app.tsrx';

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
	document.head.innerHTML = '';
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	root.render(NavApp);
	settle();
});

afterEach(() => {
	root.unmount();
	container.remove();
	document.head.innerHTML = '';
});

const click = (id: string) => {
	container.querySelector<HTMLButtonElement>('#' + id)!.click();
	settle();
};
const head = () => document.head;
const metaContent = (name: string) =>
	head().querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
const propertyContent = (property: string) =>
	head().querySelector<HTMLMetaElement>(`meta[property="${property}"]`)?.content ?? null;
const canonical = () =>
	head().querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href') ?? null;

describe('client navigation', () => {
	it('starts on the first route with the page beating the app default', () => {
		expect(document.title).toBe('Home');
		expect(head().querySelectorAll('title')).toHaveLength(1);
		expect(canonical()).toBe('https://x.dev/');
		// The app-level icon is untouched by page metadata.
		expect(head().querySelector('link[rel="icon"]')).not.toBeNull();
	});

	it('swaps page metadata on navigation without leaving the old page behind', () => {
		expect(metaContent('description')).toBe('home description');

		click('to-article');

		expect(document.title).toBe('Article');
		expect(canonical()).toBe('https://x.dev/article');
		// Absolute-ised against the fixture's `site`, which is what scrapers need.
		expect(propertyContent('og:image')).toBe('https://x.dev/og.png');
		// Home's description belonged to the unmounted page and must be gone.
		expect(metaContent('description')).toBeNull();
		expect(head().querySelectorAll('title')).toHaveLength(1);
		expect(head().querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
	});

	it('falls back to the app default when a route contributes no title', () => {
		click('to-toggling');
		expect(document.title).toBe('Toggling');
		click('to-home');
		expect(document.title).toBe('Home');
	});

	it('drops a tag the page stops rendering', () => {
		click('to-toggling');
		expect(metaContent('robots')).toBe('noindex');

		click('drop');

		expect(metaContent('robots')).toBeNull();
		// Re-rendering must not cost the page its own title.
		expect(document.title).toBe('Toggling');
		expect(head().querySelectorAll('title')).toHaveLength(1);
	});

	it('follows a descriptor whose identity changes, leaving no stale tag', () => {
		click('to-renaming');
		expect(metaContent('first')).toBe('value');

		click('rename');

		expect(metaContent('first')).toBeNull();
		expect(metaContent('second')).toBe('value');
		expect(head().querySelectorAll('meta')).toHaveLength(1);
		expect(document.title).toBe('Renaming');
	});

	it('never accumulates duplicates across repeated navigation', () => {
		for (let i = 0; i < 4; i++) {
			click('to-article');
			click('to-home');
		}
		expect(head().querySelectorAll('title')).toHaveLength(1);
		expect(head().querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
		expect(head().querySelectorAll('link[rel="icon"]')).toHaveLength(1);
		expect(document.title).toBe('Home');
		expect(metaContent('description')).toBe('home description');
	});

	it('removes everything it owns when the app unmounts', () => {
		root.unmount();
		settle();
		expect(head().querySelectorAll('title')).toHaveLength(0);
		expect(head().querySelectorAll('meta')).toHaveLength(0);
		expect(head().querySelectorAll('link')).toHaveLength(0);
		root = createRoot(container);
	});
});
