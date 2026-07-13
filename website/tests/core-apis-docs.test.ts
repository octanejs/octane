// Focused contract for the newcomer-oriented Core APIs guide. The generic
// smoke suite checks every route; this file protects the learning structure,
// local navigation, and the real interactive example embedded in the MDX.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { makeRouter } from '../src/app/router.ts';
import { docs } from '../src/content/docs.ts';

afterEach(cleanup);

async function renderCoreApis() {
	const router = makeRouter({
		history: createMemoryHistory({ initialEntries: ['/docs/core-apis'] }),
	});
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('.doc-hero')) {
			throw new Error('Core APIs document not committed');
		}
	});
	return utils;
}

describe('Core APIs documentation', () => {
	it('presents a concept-first guide with complete local navigation', async () => {
		const { container } = await renderCoreApis();
		const coreDoc = docs.find((doc) => doc.slug === 'core-apis')!;
		const sections = coreDoc.sections ?? [];

		expect(container.querySelectorAll('.prose h1')).toHaveLength(1);
		expect(container.querySelector('.prose h1')?.textContent).toBe('Core APIs');
		expect(container.querySelector('.doc-lede')?.textContent).toContain('starting from zero');
		expect(container.textContent).toContain('No React experience needed');

		const toc = container.querySelector('nav[aria-label="On this page"]')!;
		const tocLinks = Array.from(toc.querySelectorAll<HTMLAnchorElement>('a'));
		expect(tocLinks).toHaveLength(sections.length);
		for (const [index, section] of sections.entries()) {
			expect(tocLinks[index]?.getAttribute('href')).toBe(`#${section.id}`);
			expect(tocLinks[index]?.textContent).toContain(section.title);
			expect(container.querySelector(`h2#${section.id}`)).toBeTruthy();
		}

		expect(container.querySelectorAll('.topic-grid a')).toHaveLength(6);
		expect(container.querySelectorAll('.doc-callout')).toHaveLength(4);
		expect(container.querySelectorAll('details.deep-dive')).toHaveLength(2);
		expect(container.querySelector('details.challenge')).toBeTruthy();

		const highlightedSource = Array.from(container.querySelectorAll('pre.shiki')).map(
			(block) => block.textContent ?? '',
		);
		expect(highlightedSource.some((source) => source.includes('export function Counter()'))).toBe(
			true,
		);
		expect(highlightedSource.some((source) => source.includes('createRoot(container)'))).toBe(true);
		expect(highlightedSource.some((source) => source.includes('renderToString(App'))).toBe(true);

		const active = container.querySelector(
			'a.sidebar-link[href="/docs/core-apis"][data-status="active"]',
		);
		expect(active).toBeTruthy();
		expect(active?.getAttribute('aria-current')).toBe('page');
		expect(container.querySelector('.pagination-link.previous')?.getAttribute('href')).toBe(
			'/docs/quick-start',
		);
		expect(container.querySelector('.pagination-link.next')?.getAttribute('href')).toBe(
			'/docs/tsrx-vs-tsx',
		);
	});

	it('runs the embedded state example', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector('.demo')!;
		const count = demo.querySelector('.demo-count')!;
		const buttons = Array.from(demo.querySelectorAll<HTMLButtonElement>('button'));
		const remove = buttons.find((button) => button.textContent?.includes('Remove one'))!;
		const add = buttons.find((button) => button.textContent?.includes('Add one'))!;

		expect(count.textContent).toBe('0');
		expect(remove.disabled).toBe(true);

		fireEvent.click(add);
		await waitFor(() => expect(count.textContent).toBe('1'));
		expect(remove.disabled).toBe(false);

		fireEvent.click(remove);
		await waitFor(() => expect(count.textContent).toBe('0'));
		expect(remove.disabled).toBe(true);
	});

	it('collapses the mobile docs menu after choosing another page', async () => {
		const { container } = await renderCoreApis();
		const mobileMenu = container.querySelector('details.sidebar-mobile')!;
		const nextGuide = mobileMenu.querySelector<HTMLAnchorElement>('a[href="/docs/tsrx-vs-tsx"]')!;

		mobileMenu.setAttribute('open', '');
		fireEvent.click(nextGuide);

		await waitFor(() => {
			if (container.querySelector('.prose h1')?.textContent !== 'TSRX vs TSX/JSX') {
				throw new Error('next guide not committed');
			}
		});
		expect(mobileMenu.hasAttribute('open')).toBe(false);
	});
});
