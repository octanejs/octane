// Website smoke tests — render routes through the real router, compiled .tsrx
// pages, and compiled MDX documents. Keep assertions at route and structure
// boundaries; detailed copy and visual behavior belong to focused tests.
import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { makeRouter } from '../src/app/router.ts';
import { docs, defaultDoc, docGroups } from '../src/content/docs.ts';
import {
	FRAMEWORK_CARDS,
	HOME_SUMMARY,
	OCTANE_CARDS,
	type BenchCard,
} from '../src/content/benchmarks.ts';
import { createHomeSummary } from '../src/content/home-benchmark.ts';

afterEach(cleanup);

function findLink(root: ParentNode, href: string): HTMLAnchorElement | undefined {
	return Array.from(root.querySelectorAll<HTMLAnchorElement>('a')).find(
		(link) => link.getAttribute('href') === href,
	);
}

function expectedBarCount(card: BenchCard): number {
	return card.rows.reduce(
		(count, row) =>
			count + card.series.filter((series) => typeof row[series.key] === 'number').length,
		0,
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

		// The decision section stays concise, accessible and ahead of the evidence it frames.
		const why = container.querySelector<HTMLElement>('section.why[aria-labelledby="why-heading"]')!;
		expect(why.querySelector('#why-heading')?.textContent?.trim()).toBe(
			'Fast should be how your app feels. Not a new way you have to think.',
		);
		const whyQuestions = Array.from(why.querySelectorAll('.why-question')).map((question) =>
			question.textContent?.trim(),
		);
		expect(whyQuestions).toEqual([
			'Why should someone adopt Octane today?',
			"Why isn't Octane's rendering powered by signals?",
		]);
		expect(why.querySelectorAll('.why-answer')).toHaveLength(3);
		expect(why.querySelector('.why-coda')?.textContent?.trim()).toBeTruthy();
		expect(why.querySelector('.why-list')).toBeNull();
		expect(findLink(why, '/docs/tsrx-vs-tsx')).toBeTruthy();
		const bench = container.querySelector<HTMLElement>('section.bench')!;
		const homeSections = Array.from(container.querySelectorAll('main .home > section'));
		expect(homeSections.indexOf(why)).toBeLessThan(homeSections.indexOf(bench));

		// The checked-in benchmark summary reaches the chart and table renderers.
		const summary = container.querySelector('figure.bench-card');
		expect(summary?.querySelector('figcaption')).toBeTruthy();
		expect(summary?.querySelector('svg.home-bench-chart')).toBeTruthy();
		expect(summary?.querySelectorAll('.visx-bar')).toHaveLength(expectedBarCount(HOME_SUMMARY));
		expect(summary?.querySelector('.recharts-wrapper')).toBeNull();
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

		expect(container.querySelector('main .benchpage')).toBeTruthy();
		expect(container.querySelector('.recharts-wrapper')).toBeNull();
		expect(container.querySelector('.bench-plot-shell')).toBeNull();
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
			for (let index = 0; index < figures.length; index++) {
				const figure = figures[index];
				const card = cards[index];
				expect(figure.querySelector('figcaption')).toBeTruthy();
				expect(figure.querySelector('svg.bench-chart')).toBeTruthy();
				expect(figure.querySelectorAll('.visx-bar')).toHaveLength(expectedBarCount(card));
				if (card.series.length <= 2) {
					expect(figure.querySelectorAll('.value-label')).toHaveLength(expectedBarCount(card));
					expect(figure.querySelector('.visx-axis-bottom')).toBeNull();
				} else {
					expect(figure.querySelector('.visx-axis-bottom')).toBeTruthy();
				}
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
