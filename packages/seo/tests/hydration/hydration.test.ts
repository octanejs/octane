// Hydration is where an SEO library usually breaks: the server ships metadata,
// the client mounts its own copy, and the document ends up with two titles. The
// contract here is that the client ADOPTS the server's elements (same nodes) and
// keeps updating them in place.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { HydratePage } from '../_fixtures/hydrate-page.tsrx';
import { SERVER_BODY, SERVER_HEAD } from './server-html.ts';

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushSync(() => {});
}

let container: HTMLDivElement;
let error: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	document.head.innerHTML = SERVER_HEAD;
	container = document.createElement('div');
	container.innerHTML = SERVER_BODY;
	document.body.appendChild(container);
	error = vi.spyOn(console, 'error');
	warn = vi.spyOn(console, 'warn');
});

afterEach(() => {
	error.mockRestore();
	warn.mockRestore();
	container.remove();
	document.head.innerHTML = '';
});

const titles = () => document.head.querySelectorAll('title');
const metas = () => document.head.querySelectorAll('meta');
const canonicals = () => document.head.querySelectorAll('link[rel="canonical"]');

describe('@octanejs/seo hydration', () => {
	it('adopts the server metadata instead of appending duplicates', () => {
		const serverTitle = document.head.querySelector('title');
		const serverCanonical = document.head.querySelector('link[rel="canonical"]');
		expect(serverTitle).not.toBeNull();

		const root = hydrateRoot(container, HydratePage);
		settle();

		expect(error.mock.calls).toEqual([]);
		expect(warn.mock.calls).toEqual([]);
		expect(titles()).toHaveLength(1);
		expect(canonicals()).toHaveLength(1);
		expect(metas()).toHaveLength(2);
		// Node identity: adopted, not recreated.
		expect(document.head.querySelector('title')).toBe(serverTitle);
		expect(document.head.querySelector('link[rel="canonical"]')).toBe(serverCanonical);
		expect(document.title).toBe('Count 0');
		root.unmount();
	});

	it('keeps the inner page winning over the layout default after hydration', () => {
		const root = hydrateRoot(container, HydratePage);
		settle();
		expect(document.title).toBe('Count 0');
		expect(document.head.innerHTML).not.toContain('Layout default');
		root.unmount();
	});

	it('updates the adopted title in place on state change', () => {
		const root = hydrateRoot(container, HydratePage);
		settle();
		const adopted = document.head.querySelector('title');

		container.querySelector<HTMLButtonElement>('#bump')!.click();
		settle();

		expect(document.title).toBe('Count 1');
		expect(titles()).toHaveLength(1);
		// Patched, not replaced, a swapped <link> would re-fetch its resource.
		expect(document.head.querySelector('title')).toBe(adopted);
		expect(canonicals()).toHaveLength(1);
		root.unmount();
	});

	it('removes its metadata when the tree unmounts', () => {
		const root = hydrateRoot(container, HydratePage);
		settle();
		expect(titles()).toHaveLength(1);

		root.unmount();
		settle();

		expect(titles()).toHaveLength(0);
		expect(canonicals()).toHaveLength(0);
		expect(metas()).toHaveLength(0);
	});
});
