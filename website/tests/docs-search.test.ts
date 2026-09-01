// Header docs search: the index built from the raw .mdx sources, the ranking,
// and the ⌘K dialog wired through the real router.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { getRouter } from '../src/router.ts';
import { docs } from '../src/content/docs.ts';
import { headingsFor, loadSearchIndex, searchDocs } from '../src/lib/docs-search.ts';

const rawDocs = import.meta.glob('../src/content/docs/*.mdx', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

function rawDoc(slug: string): string {
	const entry = Object.entries(rawDocs).find(([path]) => path.endsWith(`/${slug}.mdx`));
	if (!entry) throw new Error(`missing raw doc for ${slug}`);
	return entry[1];
}

function frontmatterTitle(source: string): string | undefined {
	return source.match(/^---\s*$([\s\S]*?)^---\s*$/m)?.[1].match(/^title:\s*(.+)$/m)?.[1];
}

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
	it('keeps page and section metadata aligned with the authored headings', () => {
		for (const doc of docs) {
			const source = rawDoc(doc.slug);
			const headings = headingsFor(source);

			expect(frontmatterTitle(source), `${doc.slug} page title`).toBe(doc.title);
			for (const section of doc.sections ?? []) {
				const heading = headings.find((candidate) => candidate.id === section.id);
				expect(heading, `${doc.slug}#${section.id}`).toEqual({
					id: section.id,
					title: section.title,
					level: section.level ?? 2,
				});
			}

			// Every top-level authored section belongs in the registry, in page order.
			expect(
				(doc.sections ?? []).filter((section) => (section.level ?? 2) === 2).map(({ id }) => id),
				`${doc.slug} top-level sections`,
			).toEqual(headings.filter(({ level }) => level === 2).map(({ id }) => id));
		}
	});

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
		// Spans a sentence boundary on purpose: the prose has to come through
		// whole, not cut at the first full stop inside the expression.
		expect(snippets.join(' ')).toContain(
			'You need Node.js 22.22.2 or newer. Octane is currently alpha software',
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

	it('deep links behavior-root API and external-ownership searches to their guide', async () => {
		const index = await loadSearchIndex();

		for (const query of [
			'attachBehaviorRoot',
			'octane/behavior',
			'registerExternalRange',
			'external ownership',
			'permanent static',
		]) {
			const [top] = searchDocs(index, query);

			expect(top, query).toBeDefined();
			expect(top.slug, query).toBe('core-apis');
			expect(top.id, query).toBe('behavior-only-roots');
		}
	});

	it('deep links Strong-mode searches to the render contract guide', async () => {
		const index = await loadSearchIndex();
		const [top] = searchDocs(index, 'strong mode');

		expect(top).toBeDefined();
		expect(top.slug).toBe('differences-from-react');
		expect(top.id).toBe('strong-mode');
	});

	it('finds browser support and deep links required DOM API searches', async () => {
		const index = await loadSearchIndex();
		const [guide] = searchDocs(index, 'browser support');
		const [requiredApi] = searchDocs(index, 'replaceChildren');

		expect(guide).toMatchObject({ slug: 'browser-support', docTitle: 'Browser support' });
		expect(requiredApi).toMatchObject({ slug: 'browser-support', id: 'required-apis' });
		const snippets = requiredApi.lines.map((line) => line.parts.map((part) => part.text).join(''));
		expect(snippets.join(' ')).toContain('replaceChildren');
	});

	it('ranks a heading match above an incidental prose mention', async () => {
		const index = await loadSearchIndex();
		const [top] = searchDocs(index, 'install');

		expect(top.slug).toBe('quick-start');
		expect(top.id).toBe('install');
	});

	it('does not attach package identities to the generic bindings document', async () => {
		const index = await loadSearchIndex();
		expect(searchDocs(index, '@octanejs/dexie')).toEqual([]);
	});

	it('finds Astro in the framework integrations guide', async () => {
		const index = await loadSearchIndex();
		const [top] = searchDocs(index, '@octanejs/astro');

		expect(top.slug).toBe('framework-integrations');
		expect(top.id).toBe('astro');
	});

	it('deep links compact and spaced VS Code searches to the TSRX editor guidance', async () => {
		const index = await loadSearchIndex();
		const expected = [
			{ query: 'vscode', slug: 'quick-start', id: 'tsrx-at-a-glance' },
			{ query: 'vs code', slug: 'tsrx-vs-tsx', id: 'editor-support' },
		];

		for (const { query, slug, id } of expected) {
			const [top] = searchDocs(index, query);
			expect(top.slug, query).toBe(slug);
			expect(top.id, query).toBe(id);
		}
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
	it('advertises site-wide search from the familiar header trigger', async () => {
		const { container } = await renderRoute('/');
		const trigger = container.querySelector<HTMLButtonElement>('.search-trigger');

		expect(trigger?.getAttribute('aria-label')).toBe('Search docs, packages, and integrations');
		expect(trigger?.textContent).toContain('Search Octane');
	});

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
		// The search index is code-split; interact only after the dialog exposes its
		// ready state so a loaded runner cannot race the lazy import.
		await waitFor(
			() => {
				if (!dialog.textContent?.includes('Search the docs, packages, and integrations.')) {
					throw new Error('search index did not become ready');
				}
			},
			{ timeout: 5_000 },
		);

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

	it('ranks TanStack Router as a binding and opens its canonical directory state', async () => {
		const { container, router } = await renderRoute('/');
		const trigger = container.querySelector<HTMLButtonElement>('.search-trigger')!;
		fireEvent.click(trigger);
		const dialog = await waitFor(() =>
			document.body.querySelector<HTMLElement>('[role="dialog"]')!,
		);
		const input = dialog.querySelector<HTMLInputElement>('.search-input')!;

		fireEvent.input(input, { target: { value: 'tanstack router' } });
		const card = await waitFor(() => {
			const element = dialog.querySelector<HTMLElement>('.search-entity');
			if (!element) throw new Error('entity result did not render');
			return element;
		});
		expect(card.querySelector('.search-type')?.textContent).toBe('Library binding');
		expect(card.querySelector('.search-title')?.textContent).toBe('TanStack Router');
		expect(card.querySelector('.search-package')?.textContent).toBe('@octanejs/tanstack-router');

		fireEvent.keyDown(dialog, { key: 'Enter' });
		await waitFor(() => {
			if (router.state.location.pathname !== '/docs/bindings') {
				throw new Error('binding destination did not open');
			}
		});
		expect(router.state.location.search).toMatchObject({
			q: 'TanStack Router',
			kind: 'binding',
		});
		expect(router.state.location.hash).toBe('binding-tanstack-router');
	});

	it('waits for the filtered directory before scrolling to a binding result', async () => {
		const { container, router } = await renderRoute('/docs/bindings');
		const originalNavigate = router.navigate.bind(router);
		let releaseNavigation!: () => void;
		const navigationGate = new Promise<void>((resolve) => {
			releaseNavigation = resolve;
		});
		(router as any).navigate = async (options: any) => {
			await navigationGate;
			await originalNavigate(options);
		};

		const scrolledWithQueries: string[] = [];
		const originalScrollIntoView = Element.prototype.scrollIntoView;
		Element.prototype.scrollIntoView = function () {
			const search = router.state.location.search as Record<string, unknown>;
			scrolledWithQueries.push(String(search.q ?? ''));
		};

		try {
			fireEvent.click(container.querySelector<HTMLButtonElement>('.search-trigger')!);
			const dialog = await waitFor(() =>
				document.body.querySelector<HTMLElement>('[role="dialog"]')!,
			);
			fireEvent.input(dialog.querySelector<HTMLInputElement>('.search-input')!, {
				target: { value: 'tanstack router' },
			});
			await waitFor(() => {
				if (!dialog.querySelector('.search-entity'))
					throw new Error('entity result did not render');
			});

			fireEvent.keyDown(dialog, { key: 'Enter' });
			await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
			expect(scrolledWithQueries).toEqual([]);

			releaseNavigation();
			await waitFor(() => expect(router.state.location.pathname).toBe('/docs/bindings'));
			await waitFor(() => expect(scrolledWithQueries).toEqual(['TanStack Router']));
		} finally {
			Element.prototype.scrollIntoView = originalScrollIntoView;
		}
	});

	it('keeps TanStack Start primary, package, and guide actions independent', async () => {
		const { container, router } = await renderRoute('/');
		fireEvent.click(container.querySelector<HTMLButtonElement>('.search-trigger')!);
		const dialog = await waitFor(() =>
			document.body.querySelector<HTMLElement>('[role="dialog"]')!,
		);
		fireEvent.input(dialog.querySelector<HTMLInputElement>('.search-input')!, {
			target: { value: 'tanstack start' },
		});
		const card = await waitFor(() => {
			const element = dialog.querySelector<HTMLElement>('.search-entity');
			if (!element) throw new Error('integration result did not render');
			return element;
		});

		expect(card.querySelector('.search-type')?.textContent).toBe('Framework integration');
		expect(card.querySelector<HTMLAnchorElement>('.search-entity-package')?.href).toContain(
			'/packages/tanstack-start',
		);
		expect(
			card.querySelector<HTMLAnchorElement>('.search-entity-guide')?.getAttribute('href'),
		).toBe('/docs/framework-integrations#tanstack-start');

		fireEvent.keyDown(dialog, { key: 'ArrowDown' });
		fireEvent.keyDown(dialog, { key: 'ArrowDown' });
		const guide = dialog.querySelector<HTMLElement>(
			'[role="option"][aria-label="Open the TanStack Start integration guide"]',
		)!;
		expect(guide.getAttribute('aria-selected')).toBe('true');
		fireEvent.keyDown(dialog, { key: 'Enter' });
		await waitFor(() => {
			if (router.state.location.pathname !== '/docs/framework-integrations') {
				throw new Error('integration guide did not open');
			}
		});
		expect(router.state.location.hash).toBe('tanstack-start');
	});

	it('uses the focused secondary action when Enter bubbles to the dialog', async () => {
		const { container } = await renderRoute('/');
		fireEvent.click(container.querySelector<HTMLButtonElement>('.search-trigger')!);
		const dialog = await waitFor(() =>
			document.body.querySelector<HTMLElement>('[role="dialog"]')!,
		);
		fireEvent.input(dialog.querySelector<HTMLInputElement>('.search-input')!, {
			target: { value: 'tanstack start' },
		});
		const packageAction = await waitFor(() => {
			const element = dialog.querySelector<HTMLAnchorElement>(
				'[role="option"][aria-label="Open the TanStack Start package guide"]',
			);
			if (!element) throw new Error('package action did not render');
			return element;
		});
		let activations = 0;
		packageAction.addEventListener('click', (event) => {
			event.preventDefault();
			activations++;
		});

		fireEvent.focus(packageAction);
		expect(packageAction.getAttribute('aria-selected')).toBe('true');
		fireEvent.keyDown(packageAction, { key: 'Enter' });

		expect(activations).toBe(1);
		expect(document.body.querySelector('[role="dialog"]')).toBe(dialog);
	});

	it('opens on ⌘K / Ctrl-K and closes on Escape', async () => {
		const { container } = await renderRoute('/');
		const trigger = container.querySelector<HTMLButtonElement>('.search-trigger')!;

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
		await waitFor(() => {
			if (document.activeElement !== trigger) throw new Error('focus did not return to trigger');
		});
	});

	it('does not open on slash from an editable surface', async () => {
		await renderRoute('/');
		const editable = document.createElement('div');
		editable.contentEditable = 'true';
		document.body.append(editable);
		editable.focus();

		fireEvent.keyDown(editable, { key: '/' });
		expect(document.body.querySelector('[role="dialog"]')).toBeNull();
		editable.remove();
	});
});
