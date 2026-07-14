// Focused contract for the newcomer-oriented Core APIs guide. The generic
// smoke suite checks every route; this file protects the learning structure,
// local navigation, and the real interactive example embedded in the MDX.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@octanejs/testing-library';
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
		expect(container.querySelectorAll('[data-demo]')).toHaveLength(5);
		for (const id of ['state', 'lists', 'refs-effects', 'data', 'form']) {
			expect(container.querySelector(`[data-demo="${id}"]`)).toBeTruthy();
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
