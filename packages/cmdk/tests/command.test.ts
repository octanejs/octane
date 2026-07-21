// Phase 1 behavior: the Command menu renders its items and the cmdk attribute
// contract, infers item values from textContent, filters on input, selects the
// first valid item, and shows Empty when nothing matches.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import {
	BasicMenu,
	ControlledCallbackMenu,
	ControlledMenu,
	DialogMenu,
	DynamicValueMenu,
	GroupedMenu,
	LoadingMenu,
	LoopMenu,
	MenuWithSelect,
	ReorderMenu,
	ScoredGroupsMenu,
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

// A green test must also mean "nothing threw". Octane reports an exception
// raised inside an effect through console.error WITHOUT failing the test, so a
// broken hook can sit behind passing DOM assertions indefinitely (that is how a
// per-render TypeError in Group's useValue went unnoticed). Fail on any noise.
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	const calls = consoleError.mock.calls.map((call) => String(call[0]));
	consoleError.mockRestore();
	if (calls.length > 0) {
		throw new Error(`Unexpected console.error during test:\n${calls.join('\n')}`);
	}
});

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

	it('reorders groups by their best item score', async () => {
		// OCTANE DIVERGENCE: upstream resolves the group element by
		// `[data-value="<groupId>"]`, but data-value holds the heading text, so its
		// group reorder never fires. The port matches on the registered value.
		const app = mount(ScoredGroupsMenu);
		await settle();
		const headings = () =>
			app.findAll('[cmdk-group]').map((g) => g.querySelector('[cmdk-group-heading]')?.textContent);

		expect(headings()).toEqual(['Beta', 'Alpha']);

		// "a": Apple is a word-start match (high), Zebra matches late (low), so the
		// Alpha group outranks Beta and moves above it.
		type(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(headings()).toEqual(['Alpha', 'Beta']);

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

	it('surfaces a throwing user callback instead of swallowing it', async () => {
		// Regression: the scheduler isolated each queued callback with a bare
		// `catch {}`, so a throwing onValueChange (reached via
		// selectFirstItem -> setState('value')) disappeared silently.
		const app = mount(ControlledCallbackMenu, {
			value: '',
			onValueChange: () => {
				throw new Error('boom from onValueChange');
			},
		});
		await settle();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'app');
		await settle();

		// The failure is reported...
		const reported = consoleError.mock.calls.map((call) => String(call[0]));
		expect(reported.some((message) => message.includes('boom from onValueChange'))).toBe(true);

		// ...and the rest of the scheduled work still ran (isolation preserved):
		// filtering applied, so only Apple remains.
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);

		app.unmount();
		// This test asserts on the reported error itself, so clear it for the guard.
		consoleError.mockClear();
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

	it('refreshes the match count when an item value changes during a search', async () => {
		// Empty and a result are mutually exclusive: whenever an item is visible,
		// "no results" must not be. Re-registering an item's value re-scores that
		// item, so the aggregate count/groups have to be recomputed with it — a
		// score-only update leaves the count stale and renders both at once.
		const app = mount(DynamicValueMenu, { itemValue: 'apple' });
		await settle();

		const input = app.find('[cmdk-input]') as HTMLInputElement;
		type(input, 'zzz');
		await settle();

		// Nothing matches "zzz": the empty state is the only thing showing.
		expect(app.findAll('[cmdk-item]')).toHaveLength(0);
		expect(app.find('[cmdk-empty]')).toBeTruthy();

		// The item's value now matches the active search.
		app.update(DynamicValueMenu, { itemValue: 'zzz' });
		await settle();

		expect(app.findAll('[cmdk-item]')).toHaveLength(1);
		expect(app.container.querySelector('[cmdk-empty]')).toBeNull();
		// The group holding the newly-matching item is visible too.
		expect(app.find('[cmdk-group]').hasAttribute('hidden')).toBe(false);

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
