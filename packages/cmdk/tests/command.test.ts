import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { consoleErrorCalls } from './_setup';
import { press, settle, typeInput } from './_command-helpers';
import {
	AsyncItemsMenu,
	BasicMenu,
	ControlledMenu,
	DefaultValueMenu,
	DialogMenu,
	DisabledItemMenu,
	GroupedMenu,
	KeywordsMenu,
	LoadingMenu,
	LoopMenu,
	MenuWithSelect,
	NoFilterMenu,
} from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — Command framework contracts', () => {
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

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'ban');
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

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'zzzz');
		await settle();

		const empty = app.container.querySelector('[cmdk-empty]');
		expect(empty).toBeTruthy();
		expect(empty?.textContent).toBe('No results found.');

		app.unmount();
	});

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

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'car');
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

	it('registers each group value as data-value (from the heading)', async () => {
		// Regression: Group omitted useValue's optional trailing `aliases`, so
		// octane's trailing slot symbol landed there and `aliases.map` threw every
		// render — aborting registration before context.value/setAttribute ran, so
		// groups silently had no value at all.
		const app = mount(GroupedMenu);
		await settle();

		expect(app.findAll('[cmdk-group]').map((el) => el.getAttribute('data-value'))).toEqual([
			'Fruits',
			'Vegetables',
		]);

		app.unmount();
	});

	it('shows the separator without a search and removes it during a search', async () => {
		const app = mount(GroupedMenu);
		await settle();
		expect(app.container.querySelector('[cmdk-separator]')).toBeTruthy();

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'car');
		await settle();
		expect(app.container.querySelector('[cmdk-separator]')).toBeNull();

		app.unmount();
	});

	it('keeps --cmdk-list-height in sync with the sizer', async () => {
		// jsdom ships no ResizeObserver, so install one that reports immediately,
		// and make rAF synchronous so the write is observable without waiting on
		// jsdom's ~16ms frame timer. This asserts the observer wiring and the
		// custom property, not jsdom layout (offsetHeight is always 0 there).
		const observed: Element[] = [];
		class FakeResizeObserver {
			cb: () => void;
			constructor(cb: () => void) {
				this.cb = cb;
			}
			observe(el: Element) {
				observed.push(el);
				this.cb();
			}
			unobserve() {}
			disconnect() {}
		}
		const globals = globalThis as unknown as Record<string, unknown>;
		const realRaf = globals.requestAnimationFrame;
		globals.ResizeObserver = FakeResizeObserver;
		globals.requestAnimationFrame = (cb: (t: number) => void) => {
			cb(0);
			return 0;
		};

		// Unmount in `finally`: a failed assertion would otherwise leave this menu
		// mounted and leak it into `document`, breaking later tests that query
		// globally (Command.Dialog portals to document.body).
		let app: ReturnType<typeof mount> | undefined;
		try {
			app = mount(BasicMenu);
			await settle();

			// It observes the sizer, and writes the property onto the list wrapper.
			expect(observed).toHaveLength(1);
			expect(observed[0]).toBe(app.find('[cmdk-list-sizer]'));
			expect(
				(app.find('[cmdk-list]') as HTMLElement).style.getPropertyValue('--cmdk-list-height'),
			).toBe('0.0px');
		} finally {
			app?.unmount();
			delete globals.ResizeObserver;
			globals.requestAnimationFrame = realRaf;
		}
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
		const activeDescendants = () => [
			app.find('[cmdk-input]').getAttribute('aria-activedescendant'),
			app.find('[cmdk-list]').getAttribute('aria-activedescendant'),
		];
		let selected = app.find('[cmdk-item][aria-selected="true"]');
		expect(selected.textContent).toBe('Banana');
		expect(activeDescendants()).toEqual([selected.id, selected.id]);

		app.update(ControlledMenu, { value: 'Cherry' });
		await settle();
		selected = app.find('[cmdk-item][aria-selected="true"]');
		expect(selected.textContent).toBe('Cherry');
		expect(activeDescendants()).toEqual([selected.id, selected.id]);

		app.unmount();
	});

	it('matches an item by its keywords, not just its text', async () => {
		const app = mount(KeywordsMenu);
		await settle();

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'zebra');
		await settle();

		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);

		app.unmount();
	});

	it('shouldFilter={false} keeps every item and never shows Empty', async () => {
		const app = mount(NoFilterMenu);
		await settle();

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'zzzzzz');
		await settle();

		expect(app.findAll('[cmdk-item]')).toHaveLength(1);
		expect(app.container.querySelector('[cmdk-empty]')).toBeNull();

		app.unmount();
	});

	it('defaultValue selects that item instead of the first', async () => {
		const app = mount(DefaultValueMenu);
		await settle();

		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Banana');

		app.unmount();
	});

	it('skips a disabled item when auto-selecting', async () => {
		const app = mount(DisabledItemMenu);
		await settle();

		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Banana');

		app.unmount();
	});

	it('keeps Empty and the selection right as an async result set changes', async () => {
		const app = mount(AsyncItemsMenu, { items: ['Apple', 'Banana'] });
		await settle();
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'appl');
		await settle();
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);

		// The only match is withdrawn by the data source — Empty takes over.
		app.update(AsyncItemsMenu, { items: ['Banana'] });
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(0);
		expect(app.find('[cmdk-empty]')).toBeTruthy();

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, '');
		await settle();
		app.update(AsyncItemsMenu, { items: ['Apple', 'Banana', 'Cherry'] });
		await settle();
		// A still-valid selection survives new results arriving around it.
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Banana');

		// Withdrawing the selected item moves the selection on, and the combobox's
		// active descendant follows it.
		app.update(AsyncItemsMenu, { items: ['Apple', 'Cherry'] });
		await settle();
		const selected = app.find('[cmdk-item][aria-selected="true"]');
		expect(selected.textContent).toBe('Apple');
		expect(app.find('[cmdk-input]').getAttribute('aria-activedescendant')).toBe(
			selected.getAttribute('id'),
		);
		expect(consoleErrorCalls()).toEqual([]);

		app.unmount();
	});

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
