// Phase 1 behavior: the Command menu renders its items and the cmdk attribute
// contract, infers item values from textContent, filters on input, selects the
// first valid item, and shows Empty when nothing matches.
import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import {
	BasicMenu,
	ControlledMenu,
	DialogMenu,
	GroupedMenu,
	LoadingMenu,
	LoopMenu,
	MenuWithSelect,
	ReorderMenu,
} from './_fixtures/basic.tsrx';

async function settle(): Promise<void> {
	flushEffects();
	flushSync(() => {});
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushEffects();
	flushSync(() => {});
}

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('@octanejs/cmdk — Command (Phase 1)', () => {
	it('renders the cmdk attribute contract and item values', async () => {
		const app = mount(BasicMenu);
		await settle();

		expect(app.find('[cmdk-root]')).toBeTruthy();
		expect(app.find('[cmdk-input]')).toBeTruthy();
		expect(app.find('[cmdk-list]')).toBeTruthy();

		const items = app.findAll('[cmdk-item]');
		expect(items.map((el) => el.textContent)).toEqual(['Apple', 'Banana', 'Cherry']);
		// Value inferred from textContent.
		expect(items.map((el) => el.getAttribute('data-value'))).toEqual(['Apple', 'Banana', 'Cherry']);

		app.unmount();
	});

	it('selects the first valid item once items register', async () => {
		const app = mount(BasicMenu);
		await settle();

		const selected = app.findAll('[cmdk-item][aria-selected="true"]');
		expect(selected).toHaveLength(1);
		expect(selected[0].textContent).toBe('Apple');

		app.unmount();
	});

	it('filters items on input and moves selection to the first match', async () => {
		const app = mount(BasicMenu);
		await settle();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'ban');
		await settle();

		// Non-matching items unmount (each Item's render selector goes false), so
		// only Banana remains — and selection moves to it.
		const items = app.findAll('[cmdk-item]');
		expect(items.map((el) => el.textContent)).toEqual(['Banana']);
		expect(items[0].getAttribute('aria-selected')).toBe('true');

		app.unmount();
	});

	it('renders Empty when nothing matches', async () => {
		const app = mount(BasicMenu);
		await settle();

		expect(app.container.querySelector('[cmdk-empty]')).toBeNull();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'zzzz');
		await settle();

		const empty = app.container.querySelector('[cmdk-empty]');
		expect(empty).toBeTruthy();
		expect(empty?.textContent).toBe('No results found.');

		app.unmount();
	});
});

function press(el: Element, key: string): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('@octanejs/cmdk — keyboard navigation (Phase 2)', () => {
	it('ArrowDown and ArrowUp move the selection', async () => {
		const app = mount(BasicMenu);
		await settle();
		const input = app.find('[cmdk-input]');
		const selectedText = () => app.find('[cmdk-item][aria-selected="true"]').textContent;

		expect(selectedText()).toBe('Apple');

		press(input, 'ArrowDown');
		await settle();
		expect(selectedText()).toBe('Banana');

		press(input, 'ArrowDown');
		await settle();
		expect(selectedText()).toBe('Cherry');

		press(input, 'ArrowUp');
		await settle();
		expect(selectedText()).toBe('Banana');

		app.unmount();
	});

	it('Home and End jump to the first and last item', async () => {
		const app = mount(BasicMenu);
		await settle();
		const input = app.find('[cmdk-input]');
		const selectedText = () => app.find('[cmdk-item][aria-selected="true"]').textContent;

		press(input, 'End');
		await settle();
		expect(selectedText()).toBe('Cherry');

		press(input, 'Home');
		await settle();
		expect(selectedText()).toBe('Apple');

		app.unmount();
	});

	it('Enter fires onSelect for the selected item', async () => {
		const selected: string[] = [];
		const app = mount(MenuWithSelect, { onSelect: (v) => selected.push(v) });
		await settle();
		const input = app.find('[cmdk-input]');

		press(input, 'Enter');
		await settle();
		expect(selected).toEqual(['Apple']);

		press(input, 'ArrowDown');
		await settle();
		press(input, 'Enter');
		await settle();
		expect(selected).toEqual(['Apple', 'Banana']);

		app.unmount();
	});
});

describe('@octanejs/cmdk — score ordering (Phase 2)', () => {
	it('reorders results by score so DOM order follows ranking', async () => {
		const app = mount(ReorderMenu);
		await settle();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();

		// Apple (word-start match) ranks above Salad and moves to the top.
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple', 'Salad']);
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Apple');

		app.unmount();
	});

	it('leaves no orphaned nodes when a reordered set is narrowed further', async () => {
		const app = mount(ReorderMenu);
		await settle();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple', 'Salad']);

		// Narrow so only Apple matches — Salad must fully unmount from the DOM.
		type(app.find('[cmdk-input]') as HTMLInputElement, 'appl');
		await settle();

		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);
		// The list must contain no stray "Salad" text (no ghost node left behind).
		expect(app.find('[cmdk-list]').textContent).toBe('Apple');

		app.unmount();
	});
});

describe('@octanejs/cmdk — groups, separator, loading (Phase 3)', () => {
	it('renders groups with headings and hides a group with no matches', async () => {
		const app = mount(GroupedMenu);
		await settle();

		expect(app.findAll('[cmdk-group-heading]').map((el) => el.textContent)).toEqual([
			'Fruits',
			'Vegetables',
		]);
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual([
			'Apple',
			'Banana',
			'Carrot',
			'Potato',
		]);

		type(app.find('[cmdk-input]') as HTMLInputElement, 'car');
		await settle();

		// Only Carrot matches; the Fruits group has no matches and is hidden.
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Carrot']);
		const groupOf = (heading: string) =>
			app
				.findAll('[cmdk-group]')
				.find((g) => g.querySelector('[cmdk-group-heading]')?.textContent === heading)!;
		expect(groupOf('Fruits').hasAttribute('hidden')).toBe(true);
		expect(groupOf('Vegetables').hasAttribute('hidden')).toBe(false);

		app.unmount();
	});

	it('shows the separator without a search and removes it during a search', async () => {
		const app = mount(GroupedMenu);
		await settle();
		expect(app.container.querySelector('[cmdk-separator]')).toBeTruthy();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'car');
		await settle();
		expect(app.container.querySelector('[cmdk-separator]')).toBeNull();

		app.unmount();
	});

	it('renders Loading as a progressbar', async () => {
		const app = mount(LoadingMenu);
		await settle();

		const loading = app.find('[cmdk-loading]');
		expect(loading.getAttribute('role')).toBe('progressbar');
		expect(loading.getAttribute('aria-valuenow')).toBe('42');
		expect(loading.textContent).toContain('Loading things');

		app.unmount();
	});
});

describe('@octanejs/cmdk — controlled modes (Phase 3)', () => {
	it('loop wraps the selection at the ends', async () => {
		const app = mount(LoopMenu);
		await settle();
		const input = app.find('[cmdk-input]');
		const selectedText = () => app.find('[cmdk-item][aria-selected="true"]').textContent;

		// Starts at Apple; ArrowUp wraps to the last item.
		press(input, 'ArrowUp');
		await settle();
		expect(selectedText()).toBe('Cherry');

		// ArrowDown from the last item wraps back to the first.
		press(input, 'ArrowDown');
		await settle();
		expect(selectedText()).toBe('Apple');

		app.unmount();
	});

	it('controlled value drives the selection', async () => {
		const app = mount(ControlledMenu, { value: 'Banana' });
		await settle();
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Banana');

		app.update(ControlledMenu, { value: 'Cherry' });
		await settle();
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Cherry');

		app.unmount();
	});
});

describe('@octanejs/cmdk — Command.Dialog (Phase 4)', () => {
	it('renders the menu inside a portal when open', async () => {
		const app = mount(DialogMenu, { open: true });
		await settle();

		// Content is portaled to document.body, not the mount container.
		expect(document.querySelector('[cmdk-dialog]')).toBeTruthy();
		expect(document.querySelector('[cmdk-overlay]')).toBeTruthy();
		const root = document.querySelector('[cmdk-dialog] [cmdk-root]');
		expect(root).toBeTruthy();
		expect([...root!.querySelectorAll('[cmdk-item]')].map((el) => el.textContent)).toEqual([
			'Apple',
			'Banana',
		]);

		app.unmount();
		await settle();
		// The portaled content is torn down on unmount (no leak).
		expect(document.querySelector('[cmdk-dialog]')).toBeNull();
	});

	it('does not render the menu when closed', async () => {
		const app = mount(DialogMenu, { open: false });
		await settle();

		expect(document.querySelector('[cmdk-dialog]')).toBeNull();
		expect(document.querySelector('[cmdk-root]')).toBeNull();

		app.unmount();
	});
});
