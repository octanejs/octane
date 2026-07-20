// Focused contract for the newcomer-oriented Core APIs guide. This file owns
// the route's learning structure, local navigation, and real interactive
// examples so the unusually large page does not need duplicate generic smoke
// coverage.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { getRouter } from '../src/router.ts';
import { docs } from '../src/content/docs.ts';

afterEach(cleanup);

async function renderCoreApis() {
	const router = getRouter({
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

// Each case mounts the real docs route so it covers the router, MDX document,
// and embedded demo together. Keep the interaction waits narrowly bounded below,
// while allowing the full document render to finish on shared CI runners.
describe('Core APIs documentation', { timeout: 15_000 }, () => {
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
			// Each TOC entry anchors a real heading at its declared level (h2 by
			// default, h3 for nested subsections).
			const tag = section.level === 3 ? 'h3' : 'h2';
			expect(container.querySelector(`${tag}#${section.id}`)).toBeTruthy();
		}

		expect(container.querySelectorAll('.topic-grid a')).toHaveLength(7);
		expect(container.querySelectorAll('[data-demo]')).toHaveLength(9);
		for (const id of [
			'state',
			'lists',
			'refs-effects',
			'data',
			'transition',
			'deferred-value',
			'view-transitions',
			'form',
			'portal',
		]) {
			expect(container.querySelector(`[data-demo="${id}"]`)).toBeTruthy();
		}
		for (const id of [
			'use-sync-external-store',
			'hydrate-when',
			'hydrate-split',
			'hydrate-prefetch',
			'use-transition',
			'use-deferred-value',
			'view-transitions',
			'create-portal',
		]) {
			expect(container.querySelector(`h3#${id}`)).toBeTruthy();
		}
		expect(container.querySelectorAll('.doc-callout')).toHaveLength(4);
		expect(container.querySelectorAll('details.deep-dive')).toHaveLength(2);
		expect(container.querySelector('details.challenge')).toBeTruthy();

		const highlightedSource = Array.from(container.querySelectorAll('pre.shiki')).map(
			(block) => block.textContent ?? '',
		);
		for (const marker of ['<<<<<<<', '=======', '>>>>>>>']) {
			expect(highlightedSource.some((source) => source.includes(marker))).toBe(false);
		}
		expect(highlightedSource.some((source) => source.includes('export function Counter()'))).toBe(
			true,
		);
		expect(
			highlightedSource.some((source) => source.includes('<title>{props.title}</title>')),
		).toBe(true);
		expect(highlightedSource.some((source) => source.includes('document.title'))).toBe(false);
		expect(
			highlightedSource.some((source) => source.includes('export function ShortcutSearch()')),
		).toBe(true);
		expect(highlightedSource.some((source) => source.includes('createRoot(container)'))).toBe(true);
		expect(highlightedSource.some((source) => source.includes('renderToString(App'))).toBe(true);
		for (const sourceMarker of [
			'export function NetworkStatus()',
			'<Hydrate when={visible({ rootMargin:',
			'<Hydrate when={idle()} split={false}>',
			'<Hydrate when={interaction()} prefetch={idle()}>',
			'const [isPending, startTransition] = useTransition();',
			'const deferredQuery = useDeferredValue(query);',
			'<ViewTransition enter="notice-in" exit="notice-out">',
			'createPortal(',
		]) {
			expect(highlightedSource.some((source) => source.includes(sourceMarker))).toBe(true);
		}

		const apiRows = Array.from(container.querySelectorAll('.api-index-card li'));
		expect(apiRows.length).toBeGreaterThan(30);
		for (const row of apiRows) {
			expect(row.querySelector(':scope > p')).toBeNull();
			expect(row.querySelector(':scope > code')).toBeTruthy();
			expect(row.querySelector(':scope > span')).toBeTruthy();
		}
		const groupedApiCodeCount = (needle: string) =>
			apiRows.find((row) => row.textContent?.includes(needle))?.querySelectorAll(':scope > code')
				.length;
		expect(groupedApiCodeCount('useContext')).toBe(2);
		expect(groupedApiCodeCount('addTransitionType')).toBe(2);
		expect(groupedApiCodeCount('isChildrenBlock')).toBe(3);
		expect(
			apiRows.some((row) => row.querySelector(':scope > code')?.textContent === 'Hydrate'),
		).toBe(true);

		const active = container.querySelector(
			'a.sidebar-link[href="/docs/core-apis"][data-status="active"]',
		);
		expect(active).toBeTruthy();
		expect(active?.getAttribute('aria-current')).toBe('page');
		expect(container.querySelector('.pagination-link.previous')?.getAttribute('href')).toBe(
			'/docs/build-tools',
		);
		expect(container.querySelector('.pagination-link.next')?.getAttribute('href')).toBe(
			'/docs/tsrx-vs-tsx',
		);
	});

	it('keeps the current dashboard report visible during a transition', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector<HTMLElement>('[data-demo="transition"]')!;
		const dashboard = within(demo);
		const overview = dashboard.getByRole('tab', { name: 'Overview' });
		const activity = dashboard.getByRole('tab', { name: 'Activity' });
		const region = demo.querySelector<HTMLElement>('section[aria-busy]')!;

		expect(demo.querySelector('[data-report]')?.getAttribute('data-report')).toBe('overview');
		expect(overview.getAttribute('aria-selected')).toBe('true');
		expect(overview.getAttribute('class')).toContain('demo-tab-selected');
		fireEvent.click(activity);

		await waitFor(() =>
			expect(demo.querySelector('.transition-status')?.textContent).toBe(
				'Loading Activity — Overview stays on screen.',
			),
		);
		expect(region.getAttribute('aria-busy')).toBe('true');
		expect(demo.querySelector('[data-report]')?.getAttribute('data-report')).toBe('overview');
		expect(overview.getAttribute('aria-selected')).toBe('true');
		expect(activity.getAttribute('aria-selected')).toBe('false');
		expect(activity.getAttribute('class')).toContain('demo-tab-pending');
		expect(demo.querySelector('.data-loading')).toBeNull();

		await waitFor(
			() =>
				expect(demo.querySelector('[data-report]')?.getAttribute('data-report')).toBe('activity'),
			{ timeout: 2000 },
		);
		expect(region.getAttribute('aria-busy')).toBe('false');
		expect(activity.getAttribute('aria-selected')).toBe('true');
		expect(activity.getAttribute('class')).toContain('demo-tab-selected');
		expect(demo.querySelector('.transition-status')?.textContent).toBe('Activity is ready.');
	});

	it('keeps search input immediate while deferred results catch up', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector<HTMLElement>('[data-demo="deferred-value"]')!;
		const input = within(demo).getByRole('searchbox', {
			name: 'Search products',
		}) as HTMLInputElement;

		expect(demo.querySelectorAll('.product-result')).toHaveLength(6);
		fireEvent.input(input, { target: { value: 'camera' } });
		expect(input.value).toBe('camera');

		await waitFor(() => expect(demo.querySelector('.search-updating')).toBeTruthy());
		expect(demo.querySelector('.product-results')?.getAttribute('data-stale')).toBe('true');
		expect(demo.querySelectorAll('.product-result')).toHaveLength(6);

		await waitFor(() => expect(demo.querySelectorAll('.product-result')).toHaveLength(2), {
			timeout: 2000,
		});
		expect(demo.querySelector('.search-summary')?.textContent).toContain('“camera”');
		expect(demo.querySelector('.search-updating')).toBeNull();
		expect(
			Array.from(demo.querySelectorAll('.product-result')).map((item) => item.textContent),
		).toEqual(['Pocket cameraCategory: Photography', 'Camera shoulder bagCategory: Photography']);
	});

	it('runs the embedded state example', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector('[data-demo="state"]')!;
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

	it('runs the lists and conditions example through packed and empty branches', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector<HTMLElement>('[data-demo="lists"]')!;
		const packing = within(demo);
		const status = demo.querySelector('.packing-summary')!;
		const passport = packing.getByRole('checkbox', { name: 'Passport' }) as HTMLInputElement;
		const clear = Array.from(demo.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
			button.textContent?.includes('Clear list'),
		)!;
		const restore = Array.from(demo.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
			button.textContent?.includes('Restore list'),
		)!;

		expect(status.textContent).toContain('1 of 3 packed');
		expect(passport.checked).toBe(false);
		expect(packing.queryByRole('button', { name: /^(Pack|Unpack) / })).toBeNull();

		fireEvent.click(passport);
		await waitFor(() => expect(status.textContent).toContain('2 of 3 packed'));
		expect(passport.checked).toBe(true);

		const notebook = packing.getByRole('checkbox', { name: 'Notebook' }) as HTMLInputElement;
		fireEvent.click(notebook);
		await waitFor(() => expect(status.textContent).toContain('Everything is packed.'));
		expect(notebook.checked).toBe(true);

		fireEvent.click(clear);
		await waitFor(() => expect(status.textContent).toContain('Your list is empty.'));
		expect(demo.querySelector('.packing-empty')?.textContent).toContain('No items yet');
		expect(clear.disabled).toBe(true);

		fireEvent.click(restore);
		await waitFor(() => expect(demo.querySelectorAll('.packing-item')).toHaveLength(3));
		expect(status.textContent).toContain('1 of 3 packed');
		expect((packing.getByRole('checkbox', { name: 'Passport' }) as HTMLInputElement).checked).toBe(
			false,
		);
		expect((packing.getByRole('checkbox', { name: 'Charger' }) as HTMLInputElement).checked).toBe(
			true,
		);
	});

	it('runs the ref button and effect-owned keyboard shortcut', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector('[data-demo="refs-effects"]')!;
		const search = demo.querySelector<HTMLInputElement>('#core-api-search')!;
		const focusButton = Array.from(demo.querySelectorAll<HTMLButtonElement>('button')).find(
			(button) => button.textContent?.includes('Focus search'),
		)!;

		fireEvent.click(focusButton);
		expect(document.activeElement).toBe(search);
		search.blur();

		fireEvent.keyDown(window, { key: '/' });
		await waitFor(() => expect(document.activeElement).toBe(search));
		expect(demo.querySelector('.shortcut-note')?.textContent).toContain('shortcut focused');

		const formInput = container.querySelector<HTMLInputElement>('#core-api-profile-name')!;
		formInput.focus();
		fireEvent.keyDown(formInput, { key: '/' });
		expect(document.activeElement).toBe(formInput);
	});

	it('runs the data example through pending and success states', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector('[data-demo="data"]')!;
		const stage = demo.querySelector('.data-stage')!;
		const load = Array.from(demo.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
			button.textContent?.includes('Load profile'),
		)!;

		expect(stage.getAttribute('role')).toBe('status');
		expect(stage.getAttribute('aria-atomic')).toBe('true');
		fireEvent.click(load);
		await waitFor(() => expect(demo.querySelector('.data-loading')).toBeTruthy());
		expect(demo.querySelector('.data-loading')?.hasAttribute('role')).toBe(false);
		await waitFor(
			() => expect(demo.querySelector('.profile-card')?.textContent).toContain('Ada Lovelace'),
			{ timeout: 2000 },
		);
		const profile = demo.querySelector('.profile-card')!;
		expect(profile.tagName).toBe('ARTICLE');
		expect(profile.hasAttribute('role')).toBe(false);
	});

	it('runs the form action through validation, pending, and success states', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector('[data-demo="form"]')!;
		const form = demo.querySelector('form')!;
		const input = demo.querySelector<HTMLInputElement>('input[name="name"]')!;
		const submit = demo.querySelector<HTMLButtonElement>('button[type="submit"]')!;
		const result = demo.querySelector('.form-result')!;

		expect(input.value).toBe('Ada Lovelace');
		expect(result.textContent).toContain('Save the name above');
		fireEvent.input(input, { target: { value: '' } });
		fireEvent.submit(form);
		await waitFor(() => expect(result.textContent).toContain('Enter a name'));

		fireEvent.input(input, { target: { value: 'Grace Hopper' } });
		fireEvent.submit(form);
		await waitFor(() => expect(submit.textContent).toContain('Saving'));
		expect(submit.disabled).toBe(true);
		await waitFor(() => expect(result.textContent).toContain('Saved Grace Hopper.'));
		expect(submit.disabled).toBe(false);
	});

	it('runs the embedded View Transitions controls as a progressive fallback', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector<HTMLElement>('[data-demo="view-transitions"]')!;
		const cardToggle = demo.querySelector<HTMLButtonElement>('#vt-toggle-card')!;
		const heroToggle = demo.querySelector<HTMLButtonElement>('#vt-toggle-hero')!;
		const details = within(demo).getByRole('tab', { name: 'Details' });

		expect(cardToggle.textContent).toContain('Remove card');
		fireEvent.click(cardToggle);
		await waitFor(() => expect(cardToggle.textContent).toContain('Add card'));

		fireEvent.click(heroToggle);
		await waitFor(() => expect(demo.querySelector('.vtdemo-hero-big')).toBeTruthy());

		fireEvent.click(details);
		await waitFor(() => expect(demo.querySelector('.vtdemo-panel')?.textContent).toBe('Details'));

		const emittedStyles = Array.from(document.querySelectorAll('style'))
			.map((style) => style.textContent ?? '')
			.join('\n');
		expect(emittedStyles).toContain('::view-transition-old(.vt-pop-out)');
		expect(emittedStyles).toContain('::view-transition-new(.vt-slide-fwd)');
	});

	it('renders a toast into a portal target and bubbles its event through the logical parent', async () => {
		const { container } = await renderCoreApis();
		const demo = container.querySelector<HTMLElement>('[data-demo="portal"]')!;
		const logicalParent = demo.querySelector<HTMLElement>('.portal-demo-parent')!;
		const target = demo.querySelector<HTMLElement>('.portal-demo-layer')!;
		const result = demo.querySelector('.portal-demo-result')!;

		fireEvent.click(within(demo).getByRole('button', { name: 'Show saved toast' }));
		await waitFor(() => expect(target.querySelector('.portal-demo-toast')).toBeTruthy());

		const dismiss = within(target).getByRole('button', { name: 'Dismiss' });
		expect(target.contains(dismiss)).toBe(true);
		expect(logicalParent.contains(dismiss)).toBe(false);
		fireEvent.click(dismiss);

		await waitFor(() => expect(target.querySelector('.portal-demo-toast')).toBeNull());
		expect(result.textContent).toContain('logical parent: 1');
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
