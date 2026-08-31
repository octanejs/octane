// The ecosystem directory is useful before JavaScript runs and keeps every
// discovery choice in the URL so header-search links and shared views agree.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { BINDING_CATEGORIES, BINDING_COUNT } from '../src/content/bindings.ts';
import {
	FRAMEWORK_INTEGRATIONS,
	FRAMEWORK_INTEGRATION_COUNT,
} from '../src/content/framework-integrations.ts';
import { getRouter } from '../src/router.ts';

afterEach(cleanup);

async function renderRoute(url: string) {
	const router = getRouter({ history: createMemoryHistory({ initialEntries: [url] }) });
	await router.load();
	const utils = render(RouterProvider as any, { props: { router } });
	await waitFor(() => {
		if (!utils.container.querySelector('.ecosystem-directory')) {
			throw new Error('ecosystem directory did not render');
		}
	});
	return { router, ...utils };
}

describe('ecosystem directory', () => {
	it('presents integrations before curated binding categories', async () => {
		const { container } = await renderRoute('/docs/bindings');
		const headings = Array.from(
			container.querySelectorAll<HTMLElement>('.ecosystem-section-heading'),
		).map((heading) => heading.textContent?.trim());

		expect(container.querySelector('h1')?.textContent).toBe('Integrations and bindings');
		expect(container.querySelector('.doc-eyebrow')?.textContent).toBe(
			`${FRAMEWORK_INTEGRATION_COUNT} integrations · ${BINDING_COUNT} bindings`,
		);
		expect(headings).toEqual([
			'Framework integrations',
			...BINDING_CATEGORIES.map((category) => category.title),
		]);
		expect(container.querySelectorAll('.ecosystem-entity')).toHaveLength(
			FRAMEWORK_INTEGRATION_COUNT + BINDING_COUNT,
		);
		for (const integration of FRAMEWORK_INTEGRATIONS) {
			const row = container.querySelector<HTMLElement>(`#integration-${integration.guideAnchor}`);
			expect(row).toBeTruthy();
			expect(row?.querySelector('code')?.textContent).toBe(integration.packageName);
			expect(row?.querySelector<HTMLAnchorElement>('a')?.getAttribute('href')).toContain(
				`/packages/${integration.packageName.replace('@octanejs/', '')}`,
			);
		}
		expect(container.querySelector('#binding-tanstack-router')).toBeTruthy();

		const categoryCards = Array.from(
			container.querySelectorAll<HTMLElement>('.ecosystem-section--binding-card'),
		);
		expect(categoryCards).toHaveLength(BINDING_CATEGORIES.length + 1);
		for (const [index, group] of categoryCards.slice(1).entries()) {
			const titles = Array.from(group.querySelectorAll<HTMLElement>('.ecosystem-binding-item')).map(
				(item) => item.dataset.bindingTitle,
			);
			expect(titles).toHaveLength(BINDING_CATEGORIES[index]!.packages.length);
			expect(titles).toEqual([...titles].sort((left, right) => left!.localeCompare(right!)));
		}
	});

	it('uses focused primary categories and controlled discovery tags', () => {
		const titles = BINDING_CATEGORIES.map((category) => category.title);
		const terminal = BINDING_CATEGORIES.find((category) => category.title === 'Terminal Apps');

		expect(titles).toEqual(
			expect.arrayContaining([
				'UI Libraries',
				'State Management',
				'Desktop Apps',
				'Terminal Apps',
				'Animation',
				'Tables',
				'Forms',
			]),
		);
		expect(titles.every((title) => !title.includes(',') && !/\band\b/i.test(title))).toBe(true);
		expect(Math.max(...BINDING_CATEGORIES.map((category) => category.packages.length))).toBe(15);
		expect(terminal?.packages.map((entry) => entry.title)).toEqual(['Ink', 'OpenTUI']);
		expect(
			BINDING_CATEGORIES.every((category) =>
				category.packages.every((entry) => entry.tags && entry.tags.length > 0),
			),
		).toBe(true);
	});

	it('uses the binding category card design for framework integrations', async () => {
		const { container } = await renderRoute('/docs/bindings');
		const integrationGroup = container.querySelector<HTMLElement>(
			'[aria-labelledby="ecosystem-section-framework-integrations"]',
		)!;
		const integrations = integrationGroup.querySelectorAll('.ecosystem-integration-item');
		const categoryCards = container.querySelectorAll('.ecosystem-section--binding-card');
		const bindings = container.querySelectorAll('.ecosystem-binding-item');
		const zustand = container.querySelector<HTMLElement>('#binding-zustand')!;

		expect(integrations).toHaveLength(FRAMEWORK_INTEGRATION_COUNT);
		expect(categoryCards).toHaveLength(BINDING_CATEGORIES.length + 1);
		expect(integrationGroup.querySelector('.ecosystem-count')?.textContent).toBe(
			`${FRAMEWORK_INTEGRATION_COUNT} integrations`,
		);
		expect(integrationGroup.querySelector('.ecosystem-integration-card')).toBeNull();
		expect(integrationGroup.querySelectorAll('.binding-link')).toHaveLength(
			FRAMEWORK_INTEGRATION_COUNT,
		);
		expect(bindings).toHaveLength(BINDING_COUNT);
		expect(container.querySelectorAll('.ecosystem-binding-item h4')).toHaveLength(0);
		expect(zustand.querySelector('.ecosystem-type')).toBeNull();
		expect(zustand.querySelector('code')?.textContent).toBe('@octanejs/zustand');
		expect(zustand.querySelector<HTMLAnchorElement>('a')?.getAttribute('href')).toContain(
			'/packages/zustand',
		);
	});

	it('offers category jumps while browsing and one relevance-ranked section while searching', async () => {
		const browse = await renderRoute('/docs/bindings');
		const jumps = browse.container.querySelectorAll<HTMLAnchorElement>(
			'.ecosystem-category-jumps a',
		);
		expect(jumps).toHaveLength(BINDING_CATEGORIES.length);
		expect(jumps[0]?.getAttribute('href')).toBe('#ecosystem-section-state-management');
		cleanup();

		const search = await renderRoute('/docs/bindings?q=tanstack');
		const headings = Array.from(
			search.container.querySelectorAll<HTMLElement>('.ecosystem-section-heading'),
		).map((heading) => heading.textContent?.trim());
		expect(headings).toEqual(['Search results']);
		expect(search.container.querySelector('.ecosystem-category-jumps')).toBeNull();
		expect(search.container.querySelector('.ecosystem-entity')?.id).toBe(
			'integration-tanstack-start',
		);
		expect(search.container.querySelector('.ecosystem-type')?.textContent).toBe(
			'Full-stack framework',
		);
	});

	it('server-selects a clear binding result from a header-search URL', async () => {
		const { container } = await renderRoute(
			'/docs/bindings?q=TanStack%20Router&kind=binding#binding-tanstack-router',
		);
		const cards = container.querySelectorAll<HTMLElement>('.ecosystem-entity');
		expect(cards[0]?.id).toBe('binding-tanstack-router');
		expect(cards[0]?.textContent).toContain('@octanejs/tanstack-router');
		expect(container.querySelector('.ecosystem-results-summary')?.textContent).toContain(
			'for “TanStack Router”',
		);
	});

	it('opens the global docs search instead of rendering a second search input', async () => {
		const { container } = await renderRoute('/docs/bindings');
		const trigger = container.querySelector<HTMLButtonElement>('.ecosystem-global-search button')!;
		expect(container.querySelector('#ecosystem-search')).toBeNull();
		expect(container.querySelector('.ecosystem-global-search')?.textContent).toContain(
			'Looking for a specific package?',
		);

		fireEvent.click(trigger);
		const dialog = await waitFor(() =>
			document.body.querySelector<HTMLElement>('[role="dialog"]')!,
		);
		fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it('keeps mixed integration and binding results in relevance order', async () => {
		const { container } = await renderRoute('/docs/bindings?q=vite');
		const results = Array.from(container.querySelectorAll<HTMLElement>('.ecosystem-entity')).map(
			(entity) => entity.id,
		);

		expect(results).toEqual(['binding-mobx', 'integration-tanstack-start']);
		expect(container.querySelector('.ecosystem-entity')?.classList).toContain(
			'ecosystem-binding-item',
		);
	});

	it('pushes explicit filters and restores them through browser history', async () => {
		const { container, router } = await renderRoute('/docs/bindings');
		const kind = container.querySelector<HTMLSelectElement>('#ecosystem-kind')!;
		const category = container.querySelector<HTMLSelectElement>('#ecosystem-category')!;

		fireEvent.change(kind, { target: { value: 'binding' } });
		await waitFor(() => expect(router.state.location.search).toMatchObject({ kind: 'binding' }));

		fireEvent.change(category, { target: { value: 'state-management' } });
		await waitFor(() =>
			expect(router.state.location.search).toMatchObject({
				kind: 'binding',
				category: 'state-management',
			}),
		);
		expect(container.querySelector('#binding-zustand')).toBeTruthy();

		router.history.back();
		await waitFor(() => {
			expect(router.state.location.search).toEqual({ kind: 'binding' });
			expect(category.value).toBe('');
		});
		router.history.back();
		await waitFor(() => {
			expect(router.state.location.search).toEqual({});
			expect(kind.value).toBe('');
		});
		router.history.forward();
		await waitFor(() => {
			expect(router.state.location.search).toEqual({ kind: 'binding' });
			expect(kind.value).toBe('binding');
		});
	});

	it('clears a directory anchor when filter state changes', async () => {
		const { container, router } = await renderRoute('/docs/bindings#binding-zustand');
		const kind = container.querySelector<HTMLSelectElement>('#ecosystem-kind')!;

		fireEvent.change(kind, { target: { value: 'binding' } });

		await waitFor(() => expect(router.state.location.search).toMatchObject({ kind: 'binding' }));
		expect(router.state.location.hash).toBe('');
	});

	it('explains one-character search and ignores incompatible URL filters', async () => {
		const { container } = await renderRoute(
			'/docs/bindings?q=a&kind=integration&category=state-management',
		);
		const category = container.querySelector<HTMLSelectElement>('#ecosystem-category')!;

		expect(category.value).toBe('');
		expect(category.disabled).toBe(true);
		expect(container.querySelector('.ecosystem-results-summary')?.textContent).toContain(
			'enter at least 2 characters to search',
		);
		expect(container.querySelectorAll('.ecosystem-entity')).toHaveLength(
			FRAMEWORK_INTEGRATION_COUNT,
		);
	});

	it('offers a useful reset when filters have no matches', async () => {
		const { container, router } = await renderRoute(
			'/docs/bindings?q=astro&kind=binding&category=state-management',
		);
		expect(container.querySelector('.ecosystem-empty')?.textContent).toContain('No matches');

		fireEvent.click(container.querySelector<HTMLButtonElement>('.ecosystem-reset')!);
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		expect(container.querySelectorAll('.ecosystem-entity')).toHaveLength(
			FRAMEWORK_INTEGRATION_COUNT + BINDING_COUNT,
		);
	});

	it('keeps framework packages and their deeper guides as separate actions', async () => {
		const { container } = await renderRoute('/docs/bindings?q=tanstack%20start');
		const card = container.querySelector<HTMLElement>('#integration-tanstack-start')!;

		expect(card).toBeTruthy();
		expect(
			card.querySelector<HTMLAnchorElement>('.ecosystem-package-link')?.getAttribute('href'),
		).toContain('/packages/tanstack-start');
		expect(
			card.querySelector<HTMLAnchorElement>('.ecosystem-guide-link')?.getAttribute('href'),
		).toBe('/docs/framework-integrations#tanstack-start');
	});
});
