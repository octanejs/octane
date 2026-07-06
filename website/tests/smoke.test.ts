// Website smoke tests — render the site's routes through the REAL app stack
// (@octanejs/router match tree + the compiled .tsrx pages + the compiled .mdx
// documents with Shiki highlighting) and assert the key content of each page.
// Client-side render via @octanejs/testing-library; the dev-SSR path
// (@octanejs/vite-plugin prerender + hydrate) is exercised by `pnpm dev`.
import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup, within } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/router';
import { makeRouter } from '../src/app/router.ts';

afterEach(cleanup);

// .tsrx static text and MDX paragraphs keep source line breaks/indentation in
// their text nodes — normalize whitespace before substring assertions.
function textOf(el: Element): string {
	return (el.textContent ?? '').replace(/\s+/g, ' ');
}

// Build a fresh router at `url` (memory history so tests don't share jsdom
// location state), load it, and mount the match tree. The client store factory
// commits matches inside a transition, so wait for the root layout to land.
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
	it('/ renders the hero, feature cards, and the proven strip', async () => {
		const { container } = await renderRoute('/');

		// Hero tagline + CTA.
		expect(container.querySelector('.hero-title')?.textContent).toContain(
			'programming model, compiled',
		);
		expect(textOf(container)).toContain('No virtual DOM. No rules of hooks.');
		const cta = container.querySelector('a.btn-primary') as HTMLAnchorElement;
		expect(cta?.getAttribute('href')).toBe('/docs/quick-start');

		// The .tsrx sample went through the Shiki pipeline (an .mdx module).
		expect(container.querySelector('pre.shiki')).toBeTruthy();
		expect(container.textContent).toContain('export function Counter(props) @{');

		// Feature cards.
		const cards = container.querySelectorAll('.card');
		expect(cards.length).toBe(4);
		expect(container.textContent).toContain('Compiled templates');
		expect(container.textContent).toContain('Streaming SSR');

		// Proven strip links to the differences page.
		expect(container.textContent).toContain('2,200+');
		const provenLink = Array.from(container.querySelectorAll('.proven a')).find((a) =>
			a.getAttribute('href')?.includes('differences-from-react'),
		);
		expect(provenLink).toBeTruthy();

		// Top nav (root layout).
		const nav = container.querySelector('.navlinks') as HTMLElement;
		expect(within(nav).getByText('Docs').getAttribute('href')).toBe('/docs');
		expect(within(nav).getByText('GitHub').getAttribute('href')).toContain(
			'github.com/octanejs/octane',
		);
	});

	it('/docs/quick-start renders the quick-start document with the sidebar', async () => {
		const { container } = await renderRoute('/docs/quick-start');

		expect(container.querySelector('.prose h1')?.textContent).toBe('Quick start');
		expect(container.textContent).toContain('pnpm add octane @octanejs/vite-plugin');
		// Highlighted code blocks from the MDX pipeline.
		expect(container.querySelectorAll('pre.shiki').length).toBeGreaterThan(3);

		// Sidebar lists every doc; the active one is marked.
		const sidebarLinks = Array.from(container.querySelectorAll('a.sidebar-link'));
		expect(sidebarLinks.map((a) => a.getAttribute('href'))).toEqual([
			'/docs/quick-start',
			'/docs/differences-from-react',
			'/docs/bindings',
		]);
		const active = sidebarLinks.filter((a) => a.getAttribute('data-status') === 'active');
		expect(active.map((a) => a.textContent?.trim())).toEqual(['Quick start']);
	});

	it('/docs (index) renders the default document (quick-start)', async () => {
		const { container } = await renderRoute('/docs');
		expect(container.querySelector('.prose h1')?.textContent).toBe('Quick start');
	});

	it('/docs/differences-from-react renders the divergences document', async () => {
		const { container } = await renderRoute('/docs/differences-from-react');

		expect(container.querySelector('.prose h1')?.textContent).toBe('Differences from React');
		expect(textOf(container)).toContain('No rules of hooks');
		expect(textOf(container)).toContain('LIS');
		expect(textOf(container)).toContain('The differences below are deliberate');
	});

	it('/docs/bindings renders the bindings overview table', async () => {
		const { container } = await renderRoute('/docs/bindings');

		expect(container.querySelector('.prose h1')?.textContent).toBe('Bindings');
		for (const pkg of [
			'@octanejs/zustand',
			'@octanejs/query',
			'@octanejs/router',
			'@octanejs/motion',
			'@octanejs/stylex',
			'@octanejs/lexical',
			'@octanejs/floating-ui',
			'@octanejs/radix',
			'@octanejs/mdx',
			'@octanejs/testing-library',
		]) {
			expect(container.textContent).toContain(pkg);
		}
	});

	// GAP (@octanejs/router): `createRootRoute({ notFoundComponent })` is
	// accepted but never rendered — the port's <Match> renders only the happy
	// path ("error/not-found boundaries arrive next", Match.tsrx). Until that
	// lands, an unknown URL renders the root layout with an empty outlet. This
	// test pins the current behavior so it flips when the router adds support.
	it('an unknown route renders the layout shell (notFoundComponent is a router gap)', async () => {
		const { container } = await renderRoute('/definitely/not/a/page');
		expect(container.querySelector('.navlinks')).toBeTruthy(); // layout up, no crash
		expect(textOf(container)).not.toContain('Page not found'); // flips when router supports it
	});
});
