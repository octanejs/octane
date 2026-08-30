// Website smoke tests — render routes through the real router, compiled .tsrx
// pages, and compiled MDX documents. Keep assertions at route and structure
// boundaries; detailed copy and visual behavior belong to focused tests.
import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import bundleSizeBaseline from '../../benchmarks/baselines/local/bundle-size.json';
import threeRendererBaseline from '../../benchmarks/baselines/local/three-renderer.json';
import weatherAppLighthouseBaseline from '../../benchmarks/baselines/local/weather-app-lighthouse.json';
import { getRouter } from '../src/router.ts';
import { expectRegisteredHeadings } from './support/doc-headings.ts';
import { docs, defaultDoc, docGroups } from '../src/content/docs.ts';
import { BINDING_CATEGORIES, BINDING_COUNT } from '../src/content/bindings.ts';
import {
	FRAMEWORK_INTEGRATIONS,
	FRAMEWORK_INTEGRATION_COUNT,
} from '../src/content/framework-integrations.ts';
import { ecosystemPackageGuideHref } from '../src/lib/ecosystem-presentation.ts';
import {
	FRAMEWORK_CARDS,
	HOME_SUMMARY,
	LYNX_CARDS,
	OCTANE_CARDS,
	TARGET_CARDS,
	type BenchCard,
} from '../src/content/benchmarks.ts';
import { createHomeSummary } from '../src/content/home-benchmark.ts';
import { BENCH_SECTIONS } from '../src/pages/benchmarks/Benchmarks.tsrx';

afterEach(cleanup);

// Core APIs is owned by core-apis-docs.test.ts: its large interactive guide
// needs focused assertions and a wider execution budget than generic route
// smoke coverage. The real-browser hydration suite also visits this route.
const smoke = docs.filter((doc) => doc.slug !== 'core-apis');

const HOME_BINDING_LINKS = [
	['View the TanStack binding on GitHub', 'tanstack-query'],
	['View the React Router binding on GitHub', 'remix-router'],
	['View the Redux binding on GitHub', 'redux'],
	['View the Three.js binding on GitHub', 'three'],
	['View the Radix UI binding on GitHub', 'radix'],
	['View the Apollo Client binding on GitHub', 'apollo-client'],
	['View the Lucide binding on GitHub', 'lucide'],
	['View the React Hook Form binding on GitHub', 'hook-form'],
	['View the i18next binding on GitHub', 'i18next'],
	['View the MDX binding on GitHub', 'mdx'],
	['View the visx binding on GitHub', 'visx'],
	['View the Base UI binding on GitHub', 'base-ui'],
] as const;

function findLink(root: ParentNode, href: string): HTMLAnchorElement | undefined {
	return Array.from(root.querySelectorAll<HTMLAnchorElement>('a')).find(
		(link) => link.getAttribute('href') === href,
	);
}

// A card opens on its "overall" view: one bar per series with a computable
// geomean vs the reference series (rows where either side is missing or zero
// drop out). Single-series cards chart every operation as its own bar instead.
function expectedBarCount(card: BenchCard): number {
	if (card.series.length === 1) {
		return card.rows.filter((row) => typeof row[card.series[0].key] === 'number').length;
	}
	const reference = card.series[0];
	return card.series.filter((series) =>
		card.rows.some(
			(row) =>
				typeof row[reference.key] === 'number' &&
				(row[reference.key] as number) > 0 &&
				typeof row[series.key] === 'number' &&
				(row[series.key] as number) > 0,
		),
	).length;
}

function atStableChartPrecision(card: BenchCard) {
	return {
		...card,
		rows: card.rows.map((row) =>
			Object.fromEntries(
				Object.entries(row).map(([key, value]) => [
					key,
					typeof value === 'number' ? Number(value.toPrecision(15)) : value,
				]),
			),
		),
	};
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
	it('reports total shipped gzip for every bundle-size fixture', () => {
		const bundleSize = FRAMEWORK_CARDS.find((card) => card.id === 'bundle-size')!;
		const expectedRows = [
			['rows total gzip', 'js_gzip'],
			['TodoMVC total gzip', 'todo_js_gzip'],
			['chat total gzip', 'chat_js_gzip'],
			['weather total gzip', 'weather_js_gzip'],
		] as const;
		const targets = new Map(bundleSizeBaseline.targets.map((target) => [target.name, target]));

		expect(bundleSize.rows.map((row) => row.op)).toEqual(expectedRows.map(([label]) => label));
		for (const [index, [, op]] of expectedRows.entries()) {
			const row = bundleSize.rows[index];
			for (const series of bundleSize.series) {
				const target = targets.get(series.key);
				const stat = (
					target?.ops as Record<string, { score?: number; median: number }> | undefined
				)?.[op];
				expect(row[series.key], `${row.op}/${series.key}`).toBe(stat?.score ?? stat?.median);
			}
		}
	});

	it('distinguishes simulated and observed Lighthouse paint measurements', () => {
		const lighthouse = FRAMEWORK_CARDS.find((card) => card.id === 'weather-app-lighthouse')!;
		const expectedRows = [
			['simulated FCP', 'first_contentful_paint'],
			['observed FCP', 'observed_first_contentful_paint'],
			['simulated LCP', 'largest_contentful_paint'],
			['observed LCP', 'observed_largest_contentful_paint'],
			['speed index', 'speed_index'],
			['TBT', 'total_blocking_time'],
		] as const;
		const targets = new Map(
			weatherAppLighthouseBaseline.targets.map((target) => [target.name, target]),
		);

		expect(lighthouse.rows.map((row) => row.op)).toEqual(expectedRows.map(([label]) => label));
		expect(lighthouse.description).toContain('desktop-network model');
		expect(lighthouse.description).toContain('unthrottled browser trace');
		for (const [index, [, op]] of expectedRows.entries()) {
			const row = lighthouse.rows[index];
			for (const series of lighthouse.series) {
				const target = targets.get(series.key);
				const stat = (
					target?.ops as Record<string, { score?: number; median: number }> | undefined
				)?.[op];
				expect(stat, `${row.op}/${series.key}`).toBeDefined();
				expect(row[series.key], `${row.op}/${series.key}`).toBe(stat?.score ?? stat?.median);
			}
		}
	});

	it('labels checked-in Three component reconstruction and disposal measurements', () => {
		const threeRenderer = TARGET_CARDS.find((card) => card.id === 'three-renderer')!;
		const row = threeRenderer.rows.find(
			(candidate) => candidate.op === 'reconstruct component + dispose 1k',
		);
		const targets = new Map(threeRendererBaseline.targets.map((target) => [target.name, target]));

		expect(row).toBeDefined();
		for (const series of threeRenderer.series) {
			const target = targets.get(series.key);
			const stat = (target?.ops as Record<string, { score?: number; median: number }> | undefined)
				?.reconstruct_component_dispose_1k;
			expect(stat, series.key).toBeDefined();
			expect(row?.[series.key], series.key).toBe(stat?.score ?? stat?.median);
		}
	});

	it('publishes each framework only where the checked benchmark has measurements', () => {
		// Math.log/exp may differ by one ULP between libc implementations. Keep
		// this snapshot check exact at a stable precision beyond the chart's display.
		expect(atStableChartPrecision(HOME_SUMMARY)).toEqual(
			atStableChartPrecision(createHomeSummary(FRAMEWORK_CARDS)),
		);

		for (const card of FRAMEWORK_CARDS) {
			const keys = card.series.map((series) => series.key);
			if (card.id === 'svg-dashboard') {
				expect(keys).toEqual(['octane-tsrx', 'react', 'solid', 'svelte', 'inferno']);
			} else if (card.id === 'spa-navigation') {
				expect(keys).toEqual([
					'octane-tsrx',
					'octane-jsx',
					'react',
					'solid',
					'vue-vapor',
					'inferno',
				]);
			} else {
				expect(keys, card.id).toContain('preact');
			}
			if (card.id === 'streaming-ssr' || card.id === 'spa-navigation' || card.id === 'uibench') {
				expect(keys, card.id).not.toContain('svelte');
			} else {
				expect(keys, card.id).toContain('svelte');
			}

			for (const row of card.rows) {
				if (card.id !== 'svg-dashboard' && card.id !== 'spa-navigation') {
					expect(typeof row.preact, `${card.id}/${row.op}/preact`).toBe('number');
				}
				if (card.id !== 'streaming-ssr' && card.id !== 'spa-navigation' && card.id !== 'uibench') {
					expect(typeof row.svelte, `${card.id}/${row.op}/svelte`).toBe('number');
				}
			}
		}

		const summaryKeys = HOME_SUMMARY.series.map((series) => series.key);
		expect(summaryKeys).toEqual(expect.arrayContaining(['react', 'preact', 'svelte', 'inferno']));
		expect(summaryKeys).not.toContain('react-uncompiled');

		const uibench = FRAMEWORK_CARDS.find((card) => card.id === 'uibench')!;
		expect(uibench.series.map((series) => series.key)).toEqual([
			'octane-tsrx',
			'react',
			'preact',
			'solid',
			'ripple',
			'vue-vapor',
			'inferno',
		]);
		expect(uibench.rows).toHaveLength(96);
		for (const diagnostic of ['cases', 'elements_largest', 'identity_shared']) {
			expect(
				uibench.rows.some((row) => row.op === diagnostic),
				diagnostic,
			).toBe(false);
		}
		for (const row of uibench.rows) {
			for (const series of uibench.series) {
				expect(typeof row[series.key], `${uibench.id}/${row.op}/${series.key}`).toBe('number');
			}
		}

		const memoWall = FRAMEWORK_CARDS.find((card) => card.id === 'memo-wall')!;
		expect(memoWall.series.map((series) => series.key)).toEqual(
			expect.arrayContaining(['react', 'react-uncompiled']),
		);
		const jsFramework = FRAMEWORK_CARDS.find((card) => card.id === 'js-framework')!;
		const jsFrameworkDeopt = OCTANE_CARDS.find((card) => card.id === 'js-framework-deopt')!;
		expect(jsFrameworkDeopt.rows.map((row) => row.op)).toEqual(
			jsFramework.rows.map((row) => row.op),
		);
		for (const row of jsFrameworkDeopt.rows) {
			for (const series of jsFrameworkDeopt.series) {
				expect(typeof row[series.key], `${jsFrameworkDeopt.id}/${row.op}/${series.key}`).toBe(
					'number',
				);
			}
		}
		for (const card of FRAMEWORK_CARDS) {
			if (card.id !== 'memo-wall') {
				expect(
					card.series.map((series) => series.key),
					card.id,
				).not.toContain('react-uncompiled');
			}
		}
	});

	it('/ renders the home experience and primary navigation', async () => {
		const { container } = await renderRoute('/');

		expect(container.querySelector('main .home')).toBeTruthy();
		// The redesign uses one full-width top bar across every route (no docs-only width).
		expect(container.querySelector('.topnav-inner')).toBeTruthy();
		expect(container.querySelector('.hero h1')?.textContent?.trim()).toBeTruthy();
		expect(container.textContent).toContain(
			'No virtual DOM, rules of hooks, or dependency arrays you have to maintain yourself.',
		);
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
			'Your app should feel fast. Your code should still feel familiar.',
		);
		const whyQuestions = Array.from(why.querySelectorAll('.why-question')).map((question) =>
			question.textContent?.trim(),
		);
		expect(whyQuestions).toEqual([
			'What does moving a React app to Octane look like?',
			'Why not build Octane on signals?',
		]);
		expect(why.querySelector('.why-coda')?.textContent?.trim()).toBeTruthy();
		expect(findLink(why, '/docs/tsrx-vs-tsx')).toBeTruthy();
		const bindingLinks = Array.from(why.querySelectorAll<HTMLAnchorElement>('.why-rail-tile'));
		expect(bindingLinks).toHaveLength(HOME_BINDING_LINKS.length);
		for (const [index, link] of bindingLinks.entries()) {
			const [ariaLabel, packageDirectory] = HOME_BINDING_LINKS[index]!;
			expect(link.getAttribute('href')).toBe(
				`https://github.com/octanejs/octane/tree/main/packages/${packageDirectory}`,
			);
			expect(link.getAttribute('target')).toBe('_blank');
			expect(link.getAttribute('rel')?.split(/\s+/)).toEqual(
				expect.arrayContaining(['noopener', 'noreferrer']),
			);
			expect(link.getAttribute('aria-label')).toBe(ariaLabel);
		}

		// The home composes its sections in a fixed order: hero, features, proven, why,
		// compat, lynx, spin, explorer, sponsor. (Each section carries a compiler-added
		// scoped class after its semantic one.)
		const homeSections = Array.from(container.querySelectorAll('main .home > section')).map(
			(section) => section.classList[0],
		);
		expect(homeSections).toEqual([
			'hero',
			'features',
			'proven',
			'why',
			'compat',
			'lynx',
			'spin',
			'explorer',
			'sponsor',
		]);

		// The Lynx section is the entry point to /docs/lynx: its own link, plus one
		// card per packaged example. The phones behind them are deferred, so the
		// server renders the copy and the cards mount when the section comes near.
		const lynx = container.querySelector('section.lynx')!;
		expect(lynx.querySelector('.lynx-title')?.textContent).toContain(
			'Build Native Apps, with Lynx and Octane',
		);
		expect(findLink(lynx, '/docs/lynx')).toBeTruthy();

		// The home page renders the interactive benchmark explorer from the checked-in
		// ×-vs-Octane summary (HOME_SUMMARY). The explorer's own interactions live in
		// benchmark-explorer.test.ts; here assert the section composes and the summary
		// reaches both deterministic views.
		const explorer = container.querySelector('section.explorer')!;
		expect(explorer).toBeTruthy();
		expect(explorer.querySelector('#explorer-heading')?.textContent?.trim()).toBeTruthy();
		expect(explorer.querySelector('.explorer-sub')?.textContent).toContain(
			'Every primary React comparison uses the official React Compiler.',
		);
		expect(findLink(explorer, '/benchmarks')).toBeTruthy();
		const bx = explorer.querySelector('.bx')!;
		expect(bx).toBeTruthy();
		// Both views are present from the first render so SSR and hydration share the
		// same geometry. Assert every suite row reaches the heatmap.
		await waitFor(() => {
			if (!bx.querySelector('.bx-plot')) throw new Error('explorer plot missing');
		});
		expect(bx.querySelectorAll('.bx-heat tbody tr')).toHaveLength(HOME_SUMMARY.rows.length);

		// The homepage closes by acknowledging the infrastructure sponsor with a
		// descriptive, externally linked lockup rather than an unexplained logo.
		const sponsor = container.querySelector<HTMLElement>(
			'section.sponsor[aria-labelledby="sponsor-heading"]',
		)!;
		expect(sponsor.querySelector('#sponsor-heading')?.textContent?.trim()).toBe(
			'Faster CI for a faster framework.',
		);
		expect(sponsor.querySelector('.sponsor-lead')?.textContent).toContain(
			'Blacksmith supports Octane',
		);
		const sponsorLink = findLink(sponsor, 'https://blacksmith.sh')!;
		expect(sponsorLink.getAttribute('target')).toBe('_blank');
		expect(sponsorLink.getAttribute('rel')?.split(/\s+/)).toEqual(
			expect.arrayContaining(['noopener', 'noreferrer']),
		);
		expect(sponsorLink.getAttribute('aria-label')).toBe(
			'Visit Blacksmith, Octane’s infrastructure sponsor',
		);
		expect(sponsorLink.querySelector('img')?.getAttribute('alt')).toBe('CI powered by Blacksmith');

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
		expect(container.querySelector('.benchpage-sub')?.textContent).toContain(
			'Every primary React comparison uses the official React Compiler;',
		);
		expect(container.querySelector('.benchpage-sub')?.textContent).toContain(
			'memo-wall also shows an explicitly uncompiled control.',
		);
		expect(container.querySelector('.recharts-wrapper')).toBeNull();
		expect(container.querySelector('.bench-plot-shell')).toBeNull();
		const sections = [
			{ id: 'bench-frameworks', cards: FRAMEWORK_CARDS },
			{ id: 'bench-targets', cards: TARGET_CARDS },
			{ id: 'bench-lynx', cards: LYNX_CARDS },
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
				// One bar per framework for the default "overall" view; multi-series
				// cards expose "overall" plus every operation as picker buttons,
				// single-series cards chart their operations directly with no picker.
				expect(figure.querySelectorAll('.bench-fill')).toHaveLength(expectedBarCount(card));
				expect(figure.querySelectorAll('.bench-op')).toHaveLength(
					card.series.length > 1 ? card.rows.length + 1 : 0,
				);
				expect(figure.querySelector('details.bench-table table')).toBeTruthy();
			}
		}
		const lighthouse = container.querySelector('#bench-weather-app-lighthouse')!;
		expect(
			Array.from(lighthouse.querySelectorAll('tbody th[scope="row"]')).map((row) =>
				row.textContent?.trim(),
			),
		).toEqual([
			'simulated FCP',
			'observed FCP',
			'simulated LCP',
			'observed LCP',
			'speed index',
			'TBT',
		]);
		const threeRenderer = container.querySelector('#bench-three-renderer')!;
		expect(
			Array.from(threeRenderer.querySelectorAll('tbody th[scope="row"]')).map((row) =>
				row.textContent?.trim(),
			),
		).toContain('reconstruct component + dispose 1k');

		// The left sidebar scroll-spy lists every section plus a nested row per
		// benchmark card, and each link's anchor target exists in the document: a
		// section heading for level-2 rows, an anchored card wrapper for level-3 rows.
		const toc = container.querySelector('nav[aria-label="On this page"]')!;
		expect(toc).toBeTruthy();
		expect(container.querySelector('.benchpage-sidebar')?.contains(toc)).toBe(true);
		expect(container.querySelector('.benchpage-main')?.contains(toc)).toBe(false);
		const mobileToggle = container.querySelector('.benchpage-sidebar-toggle');
		expect(container.querySelectorAll('.benchpage-sidebar-toggle')).toHaveLength(1);
		expect(mobileToggle?.textContent).toContain('Benchmarks');
		expect(BENCH_SECTIONS.length).toBe(
			5 + FRAMEWORK_CARDS.length + TARGET_CARDS.length + LYNX_CARDS.length + OCTANE_CARDS.length,
		);
		for (const section of BENCH_SECTIONS) {
			expect(findLink(toc, `#${section.id}`)?.textContent).toContain(section.title);
			const target = container.querySelector(`#${section.id}`)!;
			expect(target, section.id).toBeTruthy();
			if (section.level === 3) {
				expect(target.querySelector('figure.bench-card'), section.id).toBeTruthy();
				// The rail click moves focus onto this wrapper, so it must expose an
				// accessible name announcing which chart the reader landed on.
				expect(target.getAttribute('role'), section.id).toBe('group');
				expect(target.getAttribute('aria-label'), section.id).toBe(section.title);
			} else {
				expect(target.tagName).toBe('H2');
			}
		}
	});

	it('/docs renders the configured default document', async () => {
		const { container } = await renderRoute('/docs');
		expect(container.querySelector('.prose h1')?.textContent?.trim()).toBe(defaultDoc.title);
		// Docs shares the same full-width top bar as every other route.
		expect(container.querySelector('.topnav-inner')).toBeTruthy();
	});

	it.each(smoke)('/docs/$slug renders its MDX document and active sidebar link', async (doc) => {
		const { container } = await renderRoute(`/docs/${doc.slug}`);

		expect(container.querySelector('.prose h1')?.textContent?.trim()).toBe(doc.title);
		expect(container.querySelectorAll('.prose .doc-hero')).toHaveLength(1);
		expect(container.querySelector('.prose .doc-lede')?.textContent?.trim()).toBeTruthy();
		expect(doc.sections?.length).toBeGreaterThan(0);
		const toc = container.querySelector('nav[aria-label="On this page"]')!;
		const sidebar = container.querySelector('.sidebar-nav')!;
		expect(sidebar.contains(toc)).toBe(true);
		expect(container.querySelector('.doc-frame')?.contains(toc)).toBe(false);
		for (const section of doc.sections ?? []) {
			expect(findLink(toc, `#${section.id}`)?.textContent).toContain(section.title);
			const tag = section.level === 3 ? 'h3' : 'h2';
			expect(container.querySelector(`${tag}#${section.id}`)).toBeTruthy();
		}
		// And the other direction. Registering a section is what puts it in this
		// table of contents, in the sidebar reading order, and in the section list
		// the remote MCP server serves from the same registry — so an `<h2>` that
		// no entry names is invisible in all three at once, while the loop above
		// still passes. `<h3>` stays opt-in: it marks a subsection that a document
		// may or may not want surfaced.
		expectRegisteredHeadings(container, doc);
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

	it('/docs/quick-start keeps inline callout prose and links inline', async () => {
		const { container } = await renderRoute('/docs/quick-start');
		const callout = Array.from(container.querySelectorAll<HTMLElement>('.doc-callout')).find(
			(candidate) =>
				candidate.querySelector('.doc-callout-title')?.textContent ===
				'Make .tsrx feel native in VS Code',
		);

		expect(callout).toBeTruthy();
		expect(callout!.querySelector('p p')).toBeNull();
		expect(callout!.querySelector('a p')).toBeNull();
		expect(callout!.querySelector('a')?.textContent).toBe('TSRX Syntax for VS Code');
	});

	it('/docs/tsrx-vs-tsx keeps the editor-support link inline', async () => {
		const { container } = await renderRoute('/docs/tsrx-vs-tsx');
		const heading = container.querySelector('h2#editor-support')!;
		let element = heading.nextElementSibling;
		let link: HTMLAnchorElement | null = null;

		while (element && element.tagName !== 'H2') {
			if (element instanceof HTMLAnchorElement) link = element;
			else link ??= element.querySelector('a');
			element = element.nextElementSibling;
		}

		expect(link?.textContent).toBe('TSRX Syntax for VS Code');
		expect(link?.querySelector('p')).toBeNull();
	});

	it('/docs/publishing-libraries renders the package-manager dry-run selector', async () => {
		const { container } = await renderRoute('/docs/publishing-libraries');
		const firstSection = container.querySelector<HTMLElement>('h2#source-package-contract')!;
		const tabs = container.querySelectorAll('.pkg-tabs [role="tab"]');

		expect(firstSection.previousElementSibling?.classList.contains('doc-hero')).toBe(true);
		expect(getComputedStyle(firstSection).borderTopStyle).toBe('none');
		expect(tabs).toHaveLength(4);
		expect(container.querySelector('.pkg-code')?.textContent).toBe('pnpm pack --dry-run');
	});

	it('/docs/bindings links every first-party binding', async () => {
		const { container } = await renderRoute('/docs/bindings');
		const packages = BINDING_CATEGORIES.flatMap((category) => category.packages);

		const packageLinks = Array.from(
			container.querySelectorAll<HTMLAnchorElement>(
				'.ecosystem-entity[id^="binding-"] a[href*="/packages/"]',
			),
		);
		expect(packageLinks).toHaveLength(BINDING_COUNT);
		expect(container.querySelector('.doc-eyebrow')?.textContent).toBe(
			`${FRAMEWORK_INTEGRATION_COUNT} integrations · ${BINDING_COUNT} bindings`,
		);
		for (const binding of packages) {
			const packageName = binding.packageName;
			const directory = packageName.slice('@octanejs/'.length);
			const href = `https://github.com/octanejs/octane/tree/main/packages/${directory}`;
			const link = packageLinks.find((candidate) => candidate.getAttribute('href') === href);
			expect(link?.textContent).toContain(packageName);
		}
	});

	it('/docs/framework-integrations links every first-party framework integration', async () => {
		const { container } = await renderRoute('/docs/framework-integrations');
		const packageLinks = Array.from(
			container.querySelectorAll<HTMLAnchorElement>(
				'.framework-integration-directory a[href*="/packages/"]',
			),
		);

		expect(packageLinks).toHaveLength(FRAMEWORK_INTEGRATION_COUNT);
		expect(container.querySelector('.doc-eyebrow')?.textContent).toBe(
			`${FRAMEWORK_INTEGRATION_COUNT} first-party framework integrations`,
		);
		for (const integration of FRAMEWORK_INTEGRATIONS) {
			const href = ecosystemPackageGuideHref(integration.packageName);
			const link = packageLinks.find((candidate) => candidate.getAttribute('href') === href);
			expect(link?.textContent).toBe(integration.packageName);
		}
		const tanstackBindings = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find(
			(link) => link.textContent?.includes('TanStack bindings'),
		);
		expect(tanstackBindings?.getAttribute('href')).toContain('/docs/bindings?q=TanStack');
		expect(tanstackBindings?.getAttribute('href')).toContain('kind=binding');
	});

	it('an unknown route renders the root notFoundComponent inside the layout', async () => {
		const { container } = await renderRoute('/definitely/not/a/page');
		expect(container.querySelector('.navlinks')).toBeTruthy();
		expect(container.querySelector('main .notfound .notfound-title')).toBeTruthy();
		expect(findLink(container.querySelector('.notfound')!, '/')).toBeTruthy();
	});
});
