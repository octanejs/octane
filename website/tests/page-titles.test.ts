// Per-page document titles: each section page names itself in the tab, docs
// pages name the active document, and leaving a titled page restores the home
// default — the same string the root route head ships, so the home page
// never needs to set anything.
import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@tanstack/octane-router';
import { getRouter } from '../src/router.ts';
import { DEFAULT_TITLE } from '../src/hooks/use-title.ts';

afterEach(cleanup);

async function renderRoute(url: string) {
	const router = getRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('main')) throw new Error('router matches not committed');
	});
	return { router, ...utils };
}

describe('page titles', () => {
	it('names each section page in the tab', async () => {
		await renderRoute('/benchmarks');
		await waitFor(() => expect(document.title).toBe('Octane — Benchmarks'));
		cleanup();

		await renderRoute('/docs/differences-from-react');
		await waitFor(() => expect(document.title).toBe('Octane — Differences from React'));
		cleanup();

		// /docs renders the default document, and titles itself after it.
		await renderRoute('/docs');
		await waitFor(() => expect(document.title).toBe('Octane — Quick start'));
	});

	it('restores the home default when a titled page unmounts', async () => {
		await renderRoute('/benchmarks');
		await waitFor(() => expect(document.title).toBe('Octane — Benchmarks'));
		cleanup();
		expect(document.title).toBe(DEFAULT_TITLE);
	});

	it('titles the 404 page', async () => {
		await renderRoute('/definitely-not-a-route');
		await waitFor(() => expect(document.title).toBe('Octane — Page not found'));
	});
});
