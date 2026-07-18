// Website smoke tests — render routes through the real router, compiled .tsrx
// pages, and compiled MDX documents. Keep assertions at route and structure
// boundaries; detailed copy and visual behavior belong to focused tests.
import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@tanstack/octane-router';
import { getRouter } from '../src/router.ts';
import { docs, defaultDoc, docGroups } from '../src/content/docs.ts';
import { BINDING_CATEGORIES, BINDING_COUNT } from '../src/content/bindings.ts';
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
	const router = getRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('main')) throw new Error('router matches not committed');
	});
	return { router, ...utils };
}

describe('website routes', () => {
	it('publishes each framework only where the checked benchmark has measurements', () => {
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
		expect(summaryKeys).not.toContain('react-compiler');

		const memoWall = FRAMEWORK_CARDS.find((card) => card.id === 'memo-wall')!;
		expect(memoWall.series.map((series) => series.key)).toContain('react-compiler');
		for (const card of FRAMEWORK_CARDS) {
			if (card.id !== 'memo-wall') {
				expect(
					card.series.map((series) => series.key),
					card.id,
				).not.toContain('react-compiler');
			}
		}
	});

	it('/ renders the home experience and primary navigation', async () => {
		const { container } = await renderRoute('/');

		expect(container.querySelector('main .home')).toBeTruthy();
		// The redesign uses one full-width top bar across every route (no docs-only width).
		expect(container.querySelector('.topnav-inner')).toBeTruthy();
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

		// The proven stat strip backs the feature claims with three headline numbers.
		const proven = container.querySelector<HTMLElement>('section.proven')!;
		expect(proven).toBeTruthy();
		const provenStats = Array.from(proven.querySelectorAll('.proven-stat'));
		expect(provenStats).toHaveLength(3);
		for (const stat of provenStats) {
			expect(stat.querySelector('.proven-number')?.textContent?.trim()).toBeTruthy();
			expect(stat.querySelector('.proven-label')?.textContent?.trim()).toBeTruthy();
		}
		const ecosystemStat = provenStats.at(-1)!;
		expect(ecosystemStat.querySelector('.proven-number')?.textContent).toBe(String(BINDING_COUNT));
		expect(ecosystemStat.querySelector('.proven-label')?.textContent).toContain(
			'first-party ecosystem bindings',
		);
		expect(findLink(ecosystemStat, '/docs/bindings')).toBeTruthy();

		// The decision section frames the evidence below with two questions and a coda
		// that links out to what TSRX adds.
		const why = container.querySelector<HTMLElement>('section.why[aria-labelledby="why-heading"]')!;
		expect(why).toBeTruthy();
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
		expect(why.querySelector('.why-coda')?.textContent?.trim()).toBeTruthy();
		expect(findLink(why, '/docs/tsrx-vs-tsx')).toBeTruthy();

		// The home composes its sections in a fixed order: hero, features, proven, why,
		// explorer. (Each section carries a compiler-added scoped class after its
		// semantic one.)
		const homeSections = Array.from(container.querySelectorAll('main .home > section')).map(
			(section) => section.classList[0],
		);
		expect(homeSections).toEqual(['hero', 'features', 'proven', 'why', 'explorer']);

		// The home page renders the interactive benchmark explorer from the checked-in
		// ×-vs-Octane summary (HOME_SUMMARY). The explorer's own interactions live in
		// benchmark-explorer.test.ts; here assert the section composes and the summary
		// reaches both deterministic views.
		const explorer = container.querySelector('section.explorer')!;
		expect(explorer).toBeTruthy();
		expect(explorer.querySelector('#explorer-heading')?.textContent?.trim()).toBeTruthy();
		expect(findLink(explorer, '/benchmarks')).toBeTruthy();
		const bx = explorer.querySelector('.bx')!;
		expect(bx).toBeTruthy();
		// Both views are present from the first render so SSR and hydration share the
		// same geometry. Assert every suite row reaches the heatmap.
		await waitFor(() => {
			if (!bx.querySelector('.bx-plot')) throw new Error('explorer plot missing');
		});
		expect(bx.querySelectorAll('.bx-heat tbody tr')).toHaveLength(HOME_SUMMARY.rows.length);

		// Section links sit with the wordmark on the left; search and the social
		// icons form the right cluster.
		const nav = container.querySelector('.navlinks')!;
		for (const href of ['/docs', '/benchmarks', '/llms.txt']) {
			expect(findLink(nav, href)).toBeTruthy();
		}
		expect(findLink(nav, '/view-transitions')).toBeUndefined();

		const navRight = container.querySelector('.nav-right')!;
		expect(navRight.querySelector('.search-trigger')).toBeTruthy();
		expect(findLink(navRight, 'https://x.com/octanejs')).toBeTruthy();
		expect(findLink(navRight, 'https://github.com/octanejs/octane')).toBeTruthy();
		expect(findLink(navRight, 'https://discord.gg/8puY9fFqd9')).toBeTruthy();

		// The footer mirrors the header's social set — X, Discord, GitHub, in that
		// order — as an icon list beside the license line.
		const footer = container.querySelector('footer')!;
		expect(footer.textContent).toContain('MIT licensed');
		const social = Array.from(footer.querySelectorAll<HTMLAnchorElement>('.footer-social a')).map(
			(link) => link.getAttribute('href'),
		);
		expect(social).toEqual([
			'https://x.com/octanejs',
			'https://discord.gg/8puY9fFqd9',
			'https://github.com/octanejs/octane',
		]);
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
		// Docs shares the same full-width top bar as every other route.
		expect(container.querySelector('.topnav-inner')).toBeTruthy();
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
		const packages = BINDING_CATEGORIES.flatMap((category) => category.packages);

		const packageLinks = Array.from(
			container.querySelectorAll<HTMLAnchorElement>('.binding-directory a[href*="/packages/"]'),
		);
		expect(packageLinks).toHaveLength(BINDING_COUNT);
		expect(container.querySelector('.doc-eyebrow')?.textContent).toBe(
			`${BINDING_COUNT} first-party bindings`,
		);
		for (const packageName of packages) {
			const directory = packageName.slice('@octanejs/'.length);
			const href = `https://github.com/octanejs/octane/tree/main/packages/${directory}`;
			const link = packageLinks.find((candidate) => candidate.getAttribute('href') === href);
			expect(link?.textContent).toBe(packageName);
		}
	});

	it('an unknown route renders the root notFoundComponent inside the layout', async () => {
		const { container } = await renderRoute('/definitely/not/a/page');
		expect(container.querySelector('.navlinks')).toBeTruthy();
		expect(container.querySelector('main .notfound .notfound-title')).toBeTruthy();
		expect(findLink(container.querySelector('.notfound')!, '/')).toBeTruthy();
	});
});
