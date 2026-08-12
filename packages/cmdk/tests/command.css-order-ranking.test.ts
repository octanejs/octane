import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { consoleErrorCalls } from './_setup';
import { inVisualOrder, pressAlt, settle, typeInput } from './_command-helpers';
import {
	AsyncItemsNoValueMenu,
	BasicMenu,
	InterleavedGroupsMenu,
	MixedItemsAndGroupsMenu,
	ReorderMenu,
	ReorderedGroupsMenu,
	WrappedItemMenu,
} from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — CSS-order ranking divergence', () => {
	it('reorders results by score so DOM order follows ranking', async () => {
		const app = mount(ReorderMenu);
		await settle();

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();

		// Apple (word-start match) ranks above Salad and is ordered to the top.
		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Salad',
		]);
		expect(app.find('[cmdk-item][aria-selected="true"]').textContent).toBe('Apple');

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
		typeInput(input as HTMLInputElement, 'ap');
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

	it('keeps ungrouped items and group hosts in disjoint rank spaces', async () => {
		// Ungrouped items and group hosts are siblings in the sizer, so their CSS
		// `order` values share one space. An ungrouped item numbered by its GLOBAL
		// rank among all items skips ahead whenever a grouped item outranks it, and
		// can then tie a group host — at which point the two paint in DOM order
		// rather than ranked order.
		const app = mount(MixedItemsAndGroupsMenu);
		await settle();
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'ap');
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
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'ap');
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
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'a');
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

		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Salad',
		]);

		// Narrow so only Apple matches — Salad must fully unmount from the DOM.
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'appl');
		await settle();

		expect(app.findAll('[cmdk-item]').map((el) => el.textContent)).toEqual(['Apple']);
		// The list must contain no stray "Salad" text (no ghost node left behind).
		expect(app.find('[cmdk-list]').textContent).toBe('Apple');

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

		typeInput(input, 'go');
		await settle();
		typeInput(input, 'zzzzzz');
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(0);

		typeInput(input, '');
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(4);

		app.unmount();
		await settle();

		// The guard in _setup.ts fails the test on any reported error; assert here
		// too so the contract is visible at the point it is being protected.
		expect(consoleErrorCalls()).toEqual([]);
	});

	it('restores every item when the search is cleared', async () => {
		// Clearing the search returns the list to SOURCE order. Ranking is applied
		// as CSS `order` and dropped when the filter goes away, so no residue can
		// accumulate — the physical-reordering approach this replaced left the list
		// permanently scrambled, differently after every search.
		const app = mount(BasicMenu);
		await settle();
		const input = app.find('[cmdk-input]') as HTMLInputElement;

		typeInput(input, 'app');
		await settle();
		expect(app.findAll('[cmdk-item]')).toHaveLength(1);

		typeInput(input, '');
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
