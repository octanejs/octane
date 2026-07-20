// Header docs search: the index built from the raw .mdx sources, the ranking,
// and the ⌘K dialog wired through the real router.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { getRouter } from '../src/router.ts';
import { docs } from '../src/content/docs.ts';
import { loadSearchIndex, searchDocs } from '../src/lib/docs-search.ts';

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

describe('docs search index', () => {
	it('indexes every document, and every section anchor the registry advertises', async () => {
		const index = await loadSearchIndex();

		for (const doc of docs) {
			const sections = index.filter((record) => record.slug === doc.slug);
			expect(sections.length, doc.slug).toBeGreaterThan(0);

			// Each `<h2 id>` in the .mdx must show up as its own linkable record.
			// Nested (level-3) entries are TOC-only — the index is built from h2
			// anchors, so they aren't expected to have their own record.
			for (const section of doc.sections ?? []) {
				if (section.level === 3) continue;
				const record = sections.find((s) => s.id === section.id);
				expect(record, doc.slug + '#' + section.id).toBeDefined();
				expect(record!.text.length).toBeGreaterThan(0);
			}
		}
	});

	it('strips MDX/JSX syntax out of the prose, but keeps code lines verbatim', async () => {
		const index = await loadSearchIndex();
		for (const record of index) {
			expect(record.text).not.toContain('```');
			for (const block of record.blocks) {
				// Prose is the authored words, not the markup around them. Code lines
				// keep their tags — a JSX example should read like the example.
				if (!block.code) expect(block.text).not.toMatch(/<\/?[a-z]/i);
			}
		}
	});

	it('shows string-expression callout prose without MDX syntax', async () => {
		const index = await loadSearchIndex();
		const [result] = searchDocs(index, 'Node.js 22');
		const snippets = result.lines.map((line) => line.parts.map((part) => part.text).join(''));

		expect(result.slug).toBe('quick-start');
		expect(snippets.join(' ')).toContain(
			'requires Node.js 22 or newer. Octane is currently alpha software',
		);
		expect(snippets.join(' ')).not.toMatch(/[{}]/);
	});
});

describe('docs search ranking', () => {
	it('finds a hook by name and deep links to the section that documents it', async () => {
		const index = await loadSearchIndex();
		const [top] = searchDocs(index, 'useState');

		expect(top).toBeDefined();
		expect(top.slug).toBe('core-apis');
		expect(top.id).toBe('state-and-events');

		// The card lists the individual lines that matched, with the term marked.
		expect(top.lines.length).toBeGreaterThan(0);
		expect(top.lines.every((line) => line.parts.some((part) => part.hit))).toBe(true);
		// Code lines are indexed too, and flagged so the dialog renders them mono.
		expect(top.lines.some((line) => line.code)).toBe(true);
	});

	it('deep links deferred hydration searches to the Hydrate guide', async () => {
		const index = await loadSearchIndex();
		const [top] = searchDocs(index, 'deferred hydration');

		expect(top).toBeDefined();
		expect(top.slug).toBe('core-apis');
		expect(top.id).toBe('deferred-hydration');
	});

	it('ranks a heading match above an incidental prose mention', async () => {
		const index = await loadSearchIndex();
		const [top] = searchDocs(index, 'install');

		expect(top.slug).toBe('quick-start');
		expect(top.id).toBe('install');
	});

	it('finds packages supplied by the curated bindings directory', async () => {
		const index = await loadSearchIndex();
		const [top] = searchDocs(index, '@octanejs/dexie');
		const snippets = top.lines.map((line) => line.parts.map((part) => part.text).join(''));

		expect(top.slug).toBe('bindings');
		expect(top.id).toBe('find-a-binding');
		expect(snippets.join(' ')).toContain('@octanejs/dexie');
	});

	it('requires every term to match, and ignores queries shorter than two characters', async () => {
		const index = await loadSearchIndex();

		expect(searchDocs(index, 'a')).toEqual([]);
		expect(searchDocs(index, 'zzzznotathing')).toEqual([]);
		// Both terms are real, but no single section carries the pair.
		expect(searchDocs(index, 'useState zzzznotathing')).toEqual([]);
	});
});

describe('search dialog', () => {
	it('is reachable from the header, and navigates to the hit on Enter', async () => {
		const { container, router } = await renderRoute('/');

		const trigger = container.querySelector<HTMLButtonElement>('.search-trigger');
		expect(trigger).toBeTruthy();

		fireEvent.click(trigger!);

		// The dialog is portalled to <body>, not into the header.
		const dialog = await waitFor(() => {
			const el = document.body.querySelector<HTMLElement>('[role="dialog"]');
			if (!el) throw new Error('dialog did not open');
			return el;
		});

		const input = dialog.querySelector<HTMLInputElement>('.search-input')!;
		fireEvent.input(input, { target: { value: 'useState' } });

		const cards = await waitFor(() => {
			const items = dialog.querySelectorAll<HTMLElement>('.search-card');
			if (items.length === 0) throw new Error('no results');
			return items;
		});
		// Each card is a breadcrumb + heading, with the matching lines under it.
		const top = cards[0];
		expect(top.querySelector('.search-crumb')?.textContent).toContain('Core APIs');
		expect(top.querySelector('.search-title')?.textContent).toContain('State');
		expect(top.querySelectorAll('.search-line').length).toBeGreaterThan(0);
		expect(top.querySelector('.search-line mark')?.textContent?.toLowerCase()).toContain(
			'usestate',
		);

		fireEvent.keyDown(dialog, { key: 'Enter' });

		await waitFor(() => {
			if (!router.state.location.pathname.startsWith('/docs/core-apis')) {
				throw new Error('did not navigate: ' + router.state.location.pathname);
			}
		});
		expect(router.state.location.hash).toBe('state-and-events');
		// Closing the dialog must not leave the page unscrollable.
		expect(document.body.querySelector('[role="dialog"]')).toBeNull();
		expect(document.body.style.overflow).not.toBe('hidden');
	});

	it('opens on ⌘K / Ctrl-K and closes on Escape', async () => {
		await renderRoute('/');

		fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
		const dialog = await waitFor(() => {
			const el = document.body.querySelector<HTMLElement>('[role="dialog"]');
			if (!el) throw new Error('dialog did not open');
			return el;
		});

		fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => {
			if (document.body.querySelector('[role="dialog"]')) throw new Error('dialog still open');
		});
	});
});
