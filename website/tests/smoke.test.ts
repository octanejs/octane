// Website smoke tests — render routes through the real router, compiled .tsrx
// pages, and compiled MDX documents. Keep assertions at route and structure
// boundaries; detailed copy and visual behavior belong to focused tests.
import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { makeRouter } from '../src/app/router.ts';
import { compactChartRows } from '../src/components/BenchBars.tsrx';
import { docs, defaultDoc, docGroups } from '../src/content/docs.ts';
import { FRAMEWORK_CARDS, HOME_SUMMARY, OCTANE_CARDS } from '../src/content/benchmarks.ts';
import { createHomeSummary } from '../src/content/home-benchmark.ts';

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
	it('publishes Preact and Svelte measurements for every supported comparison', () => {
		expect(HOME_SUMMARY).toEqual(createHomeSummary(FRAMEWORK_CARDS));

		for (const card of FRAMEWORK_CARDS) {
			const keys = card.series.map((series) => series.key);
			expect(keys, card.id).toContain('preact');
			if (card.id === 'streaming-ssr') {
				expect(keys, card.id).not.toContain('svelte');
			} else {
				expect(keys, card.id).toContain('svelte');
			}

			for (const row of card.rows) {
				expect(typeof row.preact, `${card.id}/${row.op}/preact`).toBe('number');
				if (card.id !== 'streaming-ssr') {
					expect(typeof row.svelte, `${card.id}/${row.op}/svelte`).toBe('number');
				}
			}
		}

		const summaryKeys = HOME_SUMMARY.series.map((series) => series.key);
		expect(summaryKeys).toEqual(expect.arrayContaining(['preact', 'svelte']));

		// Unsupported summary combinations remain absent from the table data, but
		// the chart packs the remaining framework bars into contiguous slots.
		const streamingRow = HOME_SUMMARY.rows.find((row) => row.op === 'streaming-ssr')!;
		const compactStreamingRow = compactChartRows(HOME_SUMMARY).find(
			(row: Record<string, string | number>) => row.op === 'streaming-ssr',
		)!;
		const originalValues = HOME_SUMMARY.series.flatMap((series) =>
			typeof streamingRow[series.key] === 'number' ? [streamingRow[series.key]] : [],
		);
		const occupiedSlots = HOME_SUMMARY.series.flatMap((series, index) =>
			typeof compactStreamingRow[series.key] === 'number' ? [index] : [],
		);
		expect(occupiedSlots).toEqual(
			Array.from({ length: originalValues.length }, (_, index) => occupiedSlots[0] + index),
		);
		expect(
			HOME_SUMMARY.series.flatMap((series) =>
				typeof compactStreamingRow[series.key] === 'number'
					? [compactStreamingRow[series.key]]
					: [],
			),
		).toEqual(originalValues);
		expect(
			Object.values(compactStreamingRow).filter((value) => /^#[0-9a-f]{6}$/.test(String(value))),
		).toEqual(
			HOME_SUMMARY.series.flatMap((series) =>
				typeof streamingRow[series.key] === 'number' ? [series.color] : [],
			),
		);
	});

	it('/ renders the home experience and primary navigation', async () => {
		const { container } = await renderRoute('/');

		expect(container.querySelector('main .home')).toBeTruthy();
		expect(container.querySelector('.topnav-inner.docs-width')).toBeNull();
		expect(container.querySelector('.hero h1')?.textContent?.trim()).toBeTruthy();
		expect(container.textContent).toContain('No hand-maintained dependency arrays');
		const heroActions = container.querySelector('.hero-actions')!;
		expect(findLink(heroActions, '/docs/quick-start')).toBeTruthy();
		expect(findLink(heroActions, '/docs/differences-from-react')).toBeTruthy();

		// The home-page MDX sample went through the Shiki pipeline.
		expect(container.querySelector('pre.shiki')).toBeTruthy();
		// Feature cards are data-driven and their copy churns; assert structure,
		// not wording (see the header note).
		const featureCards = container.querySelectorAll('.features article.card');
		expect(featureCards).toHaveLength(4);
		expect(container.querySelector('.card-eyebrow')).toBeNull();
		for (const card of Array.from(featureCards)) {
			expect(card.querySelector('.card-title')?.textContent?.trim()).toBeTruthy();
			expect(card.querySelector('.card-body')?.textContent?.trim()).toBeTruthy();
		}
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
		expect(findLink(nav, '/view-transitions')).toBeUndefined();
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
		expect(container.querySelector('.topnav-inner.docs-width')).toBeTruthy();
	});

	it.each(docs)('/docs/$slug renders its MDX document and active sidebar link', async (doc) => {
		const { container } = await renderRoute(`/docs/${doc.slug}`);

		expect(container.querySelector('.prose h1')?.textContent?.trim()).toBe(doc.title);
		expect(container.querySelectorAll('.prose .doc-hero')).toHaveLength(1);
		expect(container.querySelector('.prose .doc-lede')?.textContent?.trim()).toBeTruthy();
		expect(doc.sections?.length).toBeGreaterThan(0);
		const toc = container.querySelector('nav[aria-label="On this page"]')!;
		for (const section of doc.sections ?? []) {
			expect(findLink(toc, `#${section.id}`)?.textContent).toContain(section.title);
			expect(container.querySelector(`h2#${section.id}`)).toBeTruthy();
		}
		const sidebar = container.querySelector('.sidebar-nav')!;
		const sidebarLinks = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('a.sidebar-link'));
		expect(sidebarLinks).toHaveLength(docs.length);
		expect(sidebar.querySelectorAll('.sidebar-group')).toHaveLength(docGroups.length);
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

	it('/docs/bindings links every first-party binding', async () => {
		const { container } = await renderRoute('/docs/bindings');
		const packages = [
			'zustand',
			'jotai',
			'redux',
			'redux-toolkit',
			'apollo-client',
			'tanstack-query',
			'tanstack-router',
			'remix-router',
			'radix',
			'base-ui',
			'floating-ui',
			'motion',
			'dnd-kit',
			'sonner',
			'lucide',
			'hook-form',
			'lexical',
			'mdx',
			'i18next',
			'tanstack-table',
			'tanstack-virtual',
			'recharts',
			'visx',
			'stylex',
			'testing-library',
		];

		const packageLinks = Array.from(
			container.querySelectorAll<HTMLAnchorElement>('.doc-card a[href*="/packages/"]'),
		);
		expect(packageLinks).toHaveLength(packages.length);
		for (const packageName of packages) {
			const link = packageLinks.find((candidate) =>
				candidate.getAttribute('href')?.endsWith(`/packages/${packageName}`),
			);
			expect(link?.textContent).toBe(`@octanejs/${packageName}`);
		}
	});

	it('an unknown route renders the root notFoundComponent inside the layout', async () => {
		const { container } = await renderRoute('/definitely/not/a/page');
		expect(container.querySelector('.navlinks')).toBeTruthy();
		expect(container.querySelector('main .notfound .notfound-title')).toBeTruthy();
		expect(findLink(container.querySelector('.notfound')!, '/')).toBeTruthy();
	});
});
