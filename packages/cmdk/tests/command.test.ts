// Phase 1 behavior: the Command menu renders its items and the cmdk attribute
// contract, infers item values from textContent, filters on input, selects the
// first valid item, and shows Empty when nothing matches.
import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { clearConsoleErrors, consoleErrorCalls } from './_setup';
import {
	BasicMenu,
	ControlledCallbackMenu,
	ControlledMenu,
	DefaultValueMenu,
	DialogMenu,
	DisabledItemMenu,
	DuplicateValueMenu,
	DynamicValueMenu,
	AsyncItemsMenu,
	AsyncItemsNoValueMenu,
	ForceMountAfterMatchMenu,
	ForceMountMenu,
	ForceMountSwapMenu,
	GroupSwapMenu,
	KeywordsMenu,
	NoFilterMenu,
	ReorderedGroupsMenu,
	GroupedMenu,
	InterleavedGroupsMenu,
	LoadingMenu,
	LoopMenu,
	MenuWithSelect,
	MixedItemsAndGroupsMenu,
	WrappedItemMenu,
	RemovableMenu,
	RemovableSortedGroupsMenu,
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

/**
 * Ranked order as the user sees it. `sort()` no longer relocates DOM nodes —
 * it assigns CSS `order` inside a flex container — so the visible sequence is
 * source order re-sorted by that property, and DOM order stays source order.
 */
function inVisualOrder<T extends Element>(elements: T[]): T[] {
	return elements
		.map((el, index) => ({
			el,
			index,
			order: Number((el as unknown as HTMLElement).style.order) || 0,
		}))
		.sort((a, b) => a.order - b.order || a.index - b.index)
		.map(({ el }) => el);
}

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

// The "a green test must also mean nothing threw" guard now lives in
// tests/_setup.ts so it covers every cmdk suite, not just this file.

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

function pressAlt(el: Element, key: string): void {
	el.dispatchEvent(
		new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }),
	);
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

		// Apple (word-start match) ranks above Salad and is ordered to the top.
		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Salad',
		]);
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Apple');

		app.unmount();
	});

	it('renders an item that arrives while a search is active, with no explicit value', async () => {
		// The real async-results flow: results land while the user is already
		// typing, and — as in every upstream example — the value is inferred from
		// the item's text rather than passed as a prop. A never-scored item used to
		// deadlock: it rendered null, so `ref.current` stayed null, so `useValue`
		// had no textContent to read, so it registered empty and scored zero
		// forever. It was invisible for as long as the search was non-empty.
		const app = mount(AsyncItemsNoValueMenu, { items: ['Apple'] });
		await settle();
		type(app.find('[cmdk-input]') as HTMLInputElement, 'ap');
		await settle();
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);

		app.update(AsyncItemsNoValueMenu, { items: ['Apple', 'Apricot'] });
		await settle();
		// Apple outranks Apricot for "ap", matching cmdk@1.1.1 on React.
		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Apricot',
		]);

		app.unmount();
	});

	it('moves the selection on when the selected item is removed alongside a sibling', async () => {
		// Every item teardown scheduled its follow-up under the SAME batcher key, and
		// the batcher is a Map — so removing two items in one update let the second
		// teardown overwrite the first, and the callback that survived had captured a
		// different item. The selection was left pointing at a node that no longer
		// exists: nothing renders `aria-selected`, the combobox's
		// `aria-activedescendant` dangles at a removed id, and Enter does nothing.
		const app = mount(AsyncItemsNoValueMenu, { items: ['Apple', 'Banana', 'Cherry'] });
		await settle();
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Apple');

		// Drop the selected item together with a sibling.
		app.update(AsyncItemsNoValueMenu, { items: ['Cherry'] });
		await settle();

		const selected = app.find('[cmdk-item][aria-selected="true"]');
		expect(selected?.textContent).toBe('Cherry');

		// ...and the combobox must not be left pointing at a node that has been
		// removed from the document — the accessibility half of the same bug.
		const active = app.find('[cmdk-input]').getAttribute('aria-activedescendant');
		expect(active).toBe(selected!.getAttribute('id'));

		app.unmount();
	});

	it('alt+arrow moves between groups in ranked order, not DOM order', async () => {
		// Group navigation walked `nextElementSibling`, which is DOM order. Ranking
		// is expressed as CSS `order`, so under an active filter the DOM order and
		// the on-screen order disagree and alt+arrow landed on the wrong group — or,
		// when the visually-next group was DOM-previous, on no group at all.
		const app = mount(InterleavedGroupsMenu);
		await settle();
		const input = app.find('[cmdk-input]');
		const selectedText = () => app.find('[cmdk-item][aria-selected="true"]').textContent;

		// "ap": Apple (0.9899) outranks Snap (0.1700) outranks Grape (0.1683), so
		// the ranked group order interleaves with the source order.
		type(input as HTMLInputElement, 'ap');
		await settle();
		expect(
			inVisualOrder(app.findAll('[cmdk-group]')).map(
				(g) => g.querySelector('[cmdk-group-heading]')?.textContent,
			),
		).toEqual(['Second', 'First', 'Third']);
		expect(selectedText()).toBe('Apple');

		// Visually next after Second is First — which is DOM-BEFORE it, while a DOM
		// sibling (Third) still exists in the other direction, so the old sibling
		// walk returned a real but wrong group instead of falling through.
		pressAlt(input, 'ArrowDown');
		await settle();
		expect(selectedText()).toBe('Snap');

		pressAlt(input, 'ArrowUp');
		await settle();
		expect(selectedText()).toBe('Apple');

		app.unmount();
	});

	it('keeps a force-mounted non-match below the ranked matches', async () => {
		// A force-mounted item never scores and never unmounts, so it is the only
		// item that stays rendered without a rank. Upstream sorts every valid item by
		// score and appends them, which pushes a zero-scoring item to the BOTTOM.
		// Leaving it unranked instead puts it at the top of a flex column, because
		// the initial `order` of 0 sorts ahead of every ranked match.
		const app = mount(ForceMountAfterMatchMenu);
		await settle();
		type(app.find('[cmdk-input]') as HTMLInputElement, 'ap');
		await settle();

		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Apricot',
			'Always Here',
		]);

		app.unmount();
	});

	it('keeps ungrouped items and group hosts in disjoint rank spaces', async () => {
		// Ungrouped items and group hosts are siblings in the sizer, so their CSS
		// `order` values share one space. An ungrouped item numbered by its GLOBAL
		// rank among all items skips ahead whenever a grouped item outranks it, and
		// can then tie a group host — at which point the two paint in DOM order
		// rather than ranked order.
		const app = mount(MixedItemsAndGroupsMenu);
		await settle();
		type(app.find('[cmdk-input]') as HTMLInputElement, 'ap');
		await settle();

		const sizer = app.find('[cmdk-list-sizer]');
		const label = (el: Element) =>
			el.getAttribute('cmdk-group') === '' ? 'group' : (el.textContent ?? '');
		const children = Array.from(sizer.children).filter(
			(el) => el.hasAttribute('cmdk-group') || el.hasAttribute('cmdk-item'),
		);
		// Upstream order: the directly-listed item, then the group.
		expect(inVisualOrder(children).map(label)).toEqual(['Snap', 'group']);

		app.unmount();
	});

	it('ranks an item through the wrapper element the sizer actually lays out', async () => {
		const app = mount(WrappedItemMenu);
		await settle();
		type(app.find('[cmdk-input]') as HTMLInputElement, 'ap');
		await settle();

		const sizer = app.find('[cmdk-list-sizer]');
		const children = Array.from(sizer.children).filter(
			(el) => el.hasAttribute('cmdk-item') || el.getAttribute('data-testid') === 'wrapper',
		);
		// Apple (0.9899) outranks Snap (0.1700), so the wrapper holding Snap must
		// paint after it rather than jumping ahead as an unranked child.
		expect(inVisualOrder(children).map((el) => el.textContent)).toEqual(['Apple', 'Snap']);

		app.unmount();
	});

	it('leaves no orphaned nodes when a ranked @for list is emptied', async () => {
		// A `@for` iteration wraps each item in a SECOND comment-fenced range on top
		// of the component's own. Ranking by physically relocating the node carried
		// it out of both at once, so the loop later cleared an empty range and every
		// item survived the removal — stacked above "No results found.".
		const app = mount(AsyncItemsNoValueMenu, { items: ['Salad', 'Apple', 'Banana'] });
		await settle();
		type(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(app.findAll('[cmdk-item]').length).toBe(3);

		app.update(AsyncItemsNoValueMenu, { items: [] });
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(0);
		expect(app.find('[cmdk-list]').textContent).toBe('No results found.');

		app.unmount();
	});

	it('leaves no orphaned nodes when a reordered set is narrowed further', async () => {
		const app = mount(ReorderMenu);
		await settle();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Salad',
		]);

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
			inVisualOrder(app.findAll('[cmdk-group]')).map(
				(g) => g.querySelector('[cmdk-group-heading]')?.textContent,
			);

		expect(headings()).toEqual(['Beta', 'Alpha']);

		// "a": Apple is a word-start match (high), Zebra matches late (low), so the
		// Alpha group outranks Beta and moves above it.
		type(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(headings()).toEqual(['Alpha', 'Beta']);

		app.unmount();
	});

	it('leaves no empty group behind when a reordered group is removed', async () => {
		// Ranking a group and then removing it must not leave a shell behind. This
		// used to be a live hazard: `sort()` relocated group hosts, which strands a
		// component's node outside the comment markers that fence it, so the later
		// unmount removed the heading and items the runtime still tracked and left
		// an empty `<div cmdk-group>` in the list. Ordering is declarative now, so
		// nothing moves — the test stays as the guard against regressing to it.
		const app = mount(RemovableSortedGroupsMenu, { showBeta: true });
		await settle();
		const headings = () =>
			inVisualOrder(app.findAll('[cmdk-group]')).map(
				(g) => g.querySelector('[cmdk-group-heading]')?.textContent,
			);
		expect(headings()).toEqual(['Beta', 'Alpha', 'Gamma']);

		// "a": Apple and Avocado are word-start matches, Zebra matches late, so
		// Alpha and Gamma rank above Beta — every group host gets re-ranked.
		type(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(headings()).toEqual(['Alpha', 'Gamma', 'Beta']);

		// Remove a group that sort() moved.
		app.update(RemovableSortedGroupsMenu, { showBeta: false });
		await settle();

		// Its host must be gone, not left as an empty shell.
		expect(headings()).toEqual(['Alpha', 'Gamma']);
		expect(app.findAll('[cmdk-group]')).toHaveLength(2);
		expect(app.find('[cmdk-list]').textContent).toBe('AlphaAppleGammaAvocado');

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
		const reported = consoleErrorCalls();
		expect(reported.some((message) => message.includes('boom from onValueChange'))).toBe(true);

		// ...and the rest of the scheduled work still ran (isolation preserved):
		// filtering applied, so only Apple remains.
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);

		app.unmount();
		// This test asserts on the reported error itself, so acknowledge it.
		clearConsoleErrors();
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

	it('does not announce "no results" while a forceMount item is visible', async () => {
		// A force-mounted item is exempt from filtering, so it never enters
		// `filtered.count` — but it is on screen, and Empty and a visible item are
		// mutually exclusive.
		const app = mount(ForceMountMenu);
		await settle();

		const input = app.find('[cmdk-input]') as HTMLInputElement;
		type(input, 'zzzzzz');
		await settle();

		const items = app.findAll('[cmdk-item]');
		expect(items.map((el) => el.textContent)).toEqual(['Always Here']);
		expect(app.container.querySelector('[cmdk-empty]')).toBeNull();

		app.unmount();
	});

	it('shows Empty again once the last forceMount item unmounts', async () => {
		// The force-mount count has to be released on unmount, or Empty is
		// suppressed forever after a force-mounted item goes away.
		const app = mount(ForceMountMenu);
		await settle();
		const input = app.find('[cmdk-input]') as HTMLInputElement;
		type(input, 'zzzzzz');
		await settle();
		expect(app.container.querySelector('[cmdk-empty]')).toBeNull();

		// Swap to a menu with no force-mounted items; nothing matches, so Empty returns.
		app.update(BasicMenu);
		await settle();
		type(app.find('[cmdk-input]') as HTMLInputElement, 'zzzzzz');
		await settle();
		expect(app.container.querySelector('[cmdk-empty]')).toBeTruthy();

		app.unmount();
	});

	it('matches an item by its keywords, not just its text', async () => {
		const app = mount(KeywordsMenu);
		await settle();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'zebra');
		await settle();

		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);

		app.unmount();
	});

	it('shouldFilter={false} keeps every item and never shows Empty', async () => {
		const app = mount(NoFilterMenu);
		await settle();

		type(app.find('[cmdk-input]') as HTMLInputElement, 'zzzzzz');
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

	it('survives search, narrow-to-nothing, clear, and unmount after a reorder', async () => {
		// `sort()` relocates item nodes to put matches in score order. Octane fences
		// each component's DOM between marker comments, so a node moved out from
		// between its own markers leaves the runtime's bookkeeping pointing at a
		// range that no longer holds it — every later update and the teardown then
		// work off stale references. Typing, filtering down to nothing, clearing,
		// and unmounting walks a relocated node through all of those transitions.
		const app = mount(ReorderedGroupsMenu);
		await settle();
		const input = app.find('[cmdk-input]') as HTMLInputElement;

		type(input, 'go');
		await settle();
		type(input, 'zzzzzz');
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(0);

		type(input, '');
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(4);

		app.unmount();
		await settle();

		// The guard in _setup.ts fails the test on any reported error; assert here
		// too so the contract is visible at the point it is being protected.
		expect(consoleErrorCalls()).toEqual([]);
	});

	it('reports duplicate item values in development', async () => {
		// Two items sharing a value both render aria-selected while only the first
		// responds to Enter. The runtime cannot pick a winner, so it must say so
		// rather than silently producing a listbox with two selected options.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = mount(DuplicateValueMenu);
		await settle();

		const messages = warn.mock.calls.map((call) => String(call[0]));
		warn.mockRestore();

		expect(messages.some((m) => m.includes('share the value') && m.includes('Apple'))).toBe(true);

		app.unmount();
	});

	it.each(['item', 'force', 'group'] as const)(
		'removing a rendered %s from outside the menu reports nothing',
		async (kind) => {
			// Octane runs a removed child's effect cleanups during the PARENT's
			// render, so registration teardown that schedules work synchronously
			// updates Command while another component is rendering — which the
			// runtime reports and this suite treats as a failure. Every registration
			// path (item, force-mounted item, group) has to stay quiet, and the menu
			// has to keep working afterwards.
			const app = mount(RemovableMenu, { show: true, kind });
			await settle();
			expect(app.findAll('[cmdk-item]')).toHaveLength(2);

			app.update(RemovableMenu, { show: false, kind });
			await settle();

			expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Banana']);
			expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Banana');
			expect(consoleErrorCalls()).toEqual([]);

			app.unmount();
		},
	);

	it('keeps Empty and the selection right as an async result set changes', async () => {
		const app = mount(AsyncItemsMenu, { items: ['Apple', 'Banana'] });
		await settle();
		type(app.find('[cmdk-input]') as HTMLInputElement, 'appl');
		await settle();
		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);

		// The only match is withdrawn by the data source — Empty takes over.
		app.update(AsyncItemsMenu, { items: ['Banana'] });
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(0);
		expect(app.find('[cmdk-empty]')).toBeTruthy();

		type(app.find('[cmdk-input]') as HTMLInputElement, '');
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

	it('does not report a duplicate after a forceMount item is replaced', async () => {
		// Every registration path goes through the same `useValue`, so every
		// teardown has to release the value it registered. When only the plain-item
		// teardown released, re-showing a force-mounted item counted its value again
		// each time ("2 items share…", then "3…"), telling the author to fix code
		// that holds exactly one live item with that value.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = mount(ForceMountSwapMenu, { forced: true });
		await settle();
		app.update(ForceMountSwapMenu, { forced: false });
		await settle();
		app.update(ForceMountSwapMenu, { forced: true });
		await settle();

		const messages = warn.mock.calls.map((call) => String(call[0]));
		warn.mockRestore();

		expect(app.findAll('[cmdk-item]')).toHaveLength(1);
		expect(messages.filter((m) => m.includes('share the value'))).toEqual([]);

		app.unmount();
	});

	it('does not report a duplicate after a group is replaced', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = mount(GroupSwapMenu, { first: true });
		await settle();
		app.update(GroupSwapMenu, { first: false });
		await settle();

		const messages = warn.mock.calls.map((call) => String(call[0]));
		warn.mockRestore();

		expect(app.findAll('[cmdk-group]')).toHaveLength(1);
		expect(app.find('[cmdk-group]').getAttribute('data-value')).toBe('Fruits');
		expect(messages.filter((m) => m.includes('share the value'))).toEqual([]);

		app.unmount();
	});

	it('restores every item when the search is cleared', async () => {
		// Clearing the search returns the list to SOURCE order. Ranking is applied
		// as CSS `order` and dropped when the filter goes away, so no residue can
		// accumulate — the physical-reordering approach this replaced left the list
		// permanently scrambled, differently after every search.
		const app = mount(BasicMenu);
		await settle();
		const input = app.find('[cmdk-input]') as HTMLInputElement;

		type(input, 'app');
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(1);

		type(input, '');
		await settle();
		const texts = app.findAll('[cmdk-item]').map((el) => el.textContent);
		expect(texts).toEqual(['Apple', 'Banana', 'Cherry']);
		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Banana',
			'Cherry',
		]);

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
