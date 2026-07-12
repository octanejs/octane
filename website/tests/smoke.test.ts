// Website smoke tests — render routes through the real router, compiled .tsrx
// pages, and compiled MDX documents. Keep assertions at route and structure
// boundaries; detailed copy and visual behavior belong to focused tests.
import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { makeRouter } from '../src/app/router.ts';
import { docs, defaultDoc } from '../src/content/docs.ts';
import { FRAMEWORK_CARDS, OCTANE_CARDS } from '../src/content/benchmarks.ts';

afterEach(cleanup);

function findLink(root: ParentNode, href: string): HTMLAnchorElement | undefined {
	return Array.from(root.querySelectorAll<HTMLAnchorElement>('a')).find(
		(link) => link.getAttribute('href') === href,
	);
}

// Build a fresh router at `url` so tests do not share jsdom location state.
// The client store commits matches inside a transition, so wait for the root
// layout before making route assertions.
async function renderRoute(url: string) {
	const router = makeRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('main')) throw new Error('router matches not committed');
	});
	return { router, ...utils };
}

describe('website routes', () => {
	it('/ renders the home experience and primary navigation', async () => {
		const { container } = await renderRoute('/');

		expect(container.querySelector('main .home')).toBeTruthy();
		expect(container.querySelector('.hero h1')?.textContent?.trim()).toBeTruthy();
		const heroActions = container.querySelector('.hero-actions')!;
		expect(findLink(heroActions, '/docs/quick-start')).toBeTruthy();
		expect(findLink(heroActions, '/docs/differences-from-react')).toBeTruthy();

		// The home-page MDX sample went through the Shiki pipeline.
		expect(container.querySelector('pre.shiki')).toBeTruthy();
		expect(container.querySelectorAll('.features article.card').length).toBeGreaterThan(0);
		expect(findLink(container, '/docs/bindings')).toBeTruthy();

		// The checked-in benchmark summary reaches the chart and table renderers.
		const summary = container.querySelector('figure.bench-card');
		expect(summary?.querySelector('figcaption')).toBeTruthy();
		expect(summary?.querySelector('svg')).toBeTruthy();
		expect(summary?.querySelector('details table')).toBeTruthy();

		const nav = container.querySelector('.navlinks')!;
		for (const href of ['/docs', '/benchmarks', '/llms.txt']) {
			expect(findLink(nav, href)).toBeTruthy();
		}
		expect(findLink(nav, 'https://github.com/octanejs/octane')).toBeTruthy();
		expect(findLink(nav, 'https://discord.gg/8puY9fFqd9')).toBeTruthy();
	});

	it('/benchmarks renders every configured benchmark card', async () => {
		const { container } = await renderRoute('/benchmarks');
		// Recharts settles over microtask/raf rounds through autoBatch.
		for (let round = 0; round < 12; round++) {
			await new Promise((resolve) => setTimeout(resolve, 0));
			await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
		}

		expect(container.querySelector('main .benchpage')).toBeTruthy();
		const sections = [
			{ id: 'bench-frameworks', cards: FRAMEWORK_CARDS },
			{ id: 'bench-internal', cards: OCTANE_CARDS },
		];
		for (const { id, cards } of sections) {
			const section = container.querySelector(`section[aria-labelledby="${id}"]`)!;
			expect(section).toBeTruthy();
			expect(section.querySelector(`#${id}`)).toBeTruthy();
			const figures = Array.from(section.querySelectorAll('figure.bench-card'));
			expect(figures).toHaveLength(cards.length);
			for (const figure of figures) {
				expect(figure.querySelector('figcaption')).toBeTruthy();
				expect(figure.querySelector('svg')).toBeTruthy();
				expect(figure.querySelector('details.bench-table table')).toBeTruthy();
			}
		}
	});

	it('/docs renders the configured default document', async () => {
		const { container } = await renderRoute('/docs');
		expect(container.querySelector('.prose h1')?.textContent?.trim()).toBe(defaultDoc.title);
	});

	it.each(docs)('/docs/$slug renders its MDX document and active sidebar link', async (doc) => {
		const { container } = await renderRoute(`/docs/${doc.slug}`);

		expect(container.querySelector('.prose h1')?.textContent?.trim()).toBe(doc.title);
		const sidebar = container.querySelector('.sidebar-list')!;
		const sidebarLinks = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('a.sidebar-link'));
		expect(sidebarLinks).toHaveLength(docs.length);
		for (const entry of docs) {
			expect(findLink(sidebar, `/docs/${entry.slug}`)).toBeTruthy();
		}
		const active = sidebarLinks.filter((link) => link.getAttribute('data-status') === 'active');
		expect(active).toHaveLength(1);
		expect(active[0]?.getAttribute('href')).toBe(`/docs/${doc.slug}`);
	});

	it('/docs/quick-start renders highlighted MDX code', async () => {
		const { container } = await renderRoute('/docs/quick-start');
		expect(container.querySelector('.prose pre.shiki code')).toBeTruthy();
	});

	it('an unknown route renders the root notFoundComponent inside the layout', async () => {
		const { container } = await renderRoute('/definitely/not/a/page');
		expect(container.querySelector('.navlinks')).toBeTruthy();
		expect(container.querySelector('main .notfound .notfound-title')).toBeTruthy();
		expect(findLink(container.querySelector('.notfound')!, '/')).toBeTruthy();
	});
});
