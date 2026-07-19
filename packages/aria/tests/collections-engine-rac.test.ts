import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	DynamicListHarness,
	HideableHarness,
	SectionedHarness,
	StandaloneHiddenHarness,
	StaticListHarness,
	captured,
} from './_fixtures/collections-engine-rac.tsx';

// The RAC collections engine (src/collections/*): CollectionBuilder renders a
// hidden structural copy of the collection content into a DETACHED real-DOM
// container (octane createPortal), placeholder refs register nodes into the
// Document store, and the content render function receives immutable
// BaseCollection snapshots. These tests cover the engine's observable contract
// through CollectionBuilder + createLeafComponent/createBranchComponent +
// Collection; the user-visible item JSX renders ONLY in the real tree, from the
// built collection.

const keys = (container: Element) =>
	[...container.querySelectorAll('li')].map((li) => li.getAttribute('data-key'));

describe('RAC collections engine — static children', () => {
	it('builds a collection from static children and renders content from it', async () => {
		const r = mount(StaticListHarness);
		await act(() => {});

		const ul = r.container.querySelector('ul')!;
		expect(ul.getAttribute('data-size')).toBe('2');
		expect(ul.getAttribute('data-first')).toBe('a');
		expect(keys(r.container)).toEqual(['a', 'b']);

		const [a, b] = [...r.container.querySelectorAll('li')];
		expect(a.getAttribute('data-text')).toBe('Alpha');
		expect(a.textContent).toBe('Alpha');
		// Explicit textValue wins for element children; the cached rendered JSX
		// (NOT rendered in the hidden tree) renders in the real tree.
		expect(b.getAttribute('data-text')).toBe('Beta');
		expect(b.querySelector('b')!.textContent).toBe('Beta!');

		// The collection object handed to the content render function is queryable.
		expect(captured.collection.getItem('a').textValue).toBe('Alpha');
		expect(captured.collection.getKeyAfter('a')).toBe('b');
		expect(captured.collection.getKeyAfter('b')).toBe(null);
		r.unmount();
	});

	it('keeps the structural copy out of the visible tree and out of the document', async () => {
		const r = mount(StaticListHarness);
		await act(() => {});

		// Placeholder elements exist only in the detached host: not in the mounted
		// container, not anywhere in the document (the host is never attached).
		expect(r.container.querySelector('item')).toBe(null);
		expect(document.querySelector('item')).toBe(null);
		// The user content renders exactly once (real tree only — no hidden copy).
		expect(r.container.querySelectorAll('li').length).toBe(2);
		expect(document.querySelectorAll('li').length).toBe(2);
		r.unmount();
		expect(r.container.querySelectorAll('li').length).toBe(0);
	});
});

describe('RAC collections engine — dynamic items', () => {
	it('builds from items + render function and derives keys/textValue from item data', async () => {
		const r = mount(DynamicListHarness);
		await act(() => {});

		expect(keys(r.container)).toEqual(['a', 'b', 'c']);
		expect(r.container.querySelector('ul')!.getAttribute('data-size')).toBe('3');
		expect(
			[...r.container.querySelectorAll('li')].map((li) => li.getAttribute('data-text')),
		).toEqual(['Alpha', 'Beta', 'Gamma']);
		// Dynamic items are attached to nodes as `value`.
		expect(captured.collection.getItem('b').value).toEqual({ id: 'b', name: 'Beta' });
		r.unmount();
	});

	it('reorders: the snapshot and real tree follow a keyed move of cached children', async () => {
		const r = mount(DynamicListHarness);
		await act(() => {});
		const [liA, liB, liC] = [...r.container.querySelectorAll('li')];

		// Same item objects, new order — the hidden copy's cached elements move
		// without re-rendering (no ref re-fires), which the store must still see.
		await act(() => {
			(r.container.querySelector('[data-action="reorder"]') as HTMLElement).click();
		});

		expect(keys(r.container)).toEqual(['c', 'a', 'b']);
		expect(captured.collection.getFirstKey()).toBe('c');
		expect(captured.collection.getKeyAfter('c')).toBe('a');
		expect(captured.collection.getItem('a').index).toBe(1);
		// Real-tree DOM identity survives the reorder (keyed by node key).
		expect(r.container.querySelector('li[data-key="a"]')).toBe(liA);
		expect(r.container.querySelector('li[data-key="b"]')).toBe(liB);
		expect(r.container.querySelector('li[data-key="c"]')).toBe(liC);
		r.unmount();
	});

	it('adds and removes items, updating snapshot size and order', async () => {
		const r = mount(DynamicListHarness);
		await act(() => {});

		await act(() => {
			(r.container.querySelector('[data-action="remove"]') as HTMLElement).click();
		});
		expect(keys(r.container)).toEqual(['a', 'c']);
		expect(captured.collection.size).toBe(2);
		expect(captured.collection.getItem('b')).toBe(null);
		expect(captured.collection.getKeyAfter('a')).toBe('c');

		await act(() => {
			(r.container.querySelector('[data-action="add"]') as HTMLElement).click();
		});
		expect(keys(r.container)).toEqual(['a', 'c', 'd']);
		expect(captured.collection.size).toBe(3);
		expect(captured.collection.getItem('d').textValue).toBe('Delta');
		r.unmount();
	});

	it('updates a single replaced item without disturbing cached siblings', async () => {
		const r = mount(DynamicListHarness);
		await act(() => {});
		const [liA, liB, liC] = [...r.container.querySelectorAll('li')];

		// A new item object with the same id: only that item's node changes.
		await act(() => {
			(r.container.querySelector('[data-action="rename"]') as HTMLElement).click();
		});

		expect(keys(r.container)).toEqual(['a', 'b', 'c']);
		const nextA = r.container.querySelector('li[data-key="a"]')!;
		expect(nextA.getAttribute('data-text')).toBe('Aleph');
		expect(nextA.textContent).toBe('Aleph');
		expect(captured.collection.getItem('a').textValue).toBe('Aleph');
		// Cached siblings keep DOM identity (same item objects → cached elements,
		// unchanged nodes); the renamed row reuses its keyed element.
		expect(nextA).toBe(liA);
		expect(r.container.querySelector('li[data-key="b"]')).toBe(liB);
		expect(r.container.querySelector('li[data-key="c"]')).toBe(liC);
		r.unmount();
	});
});

describe('RAC collections engine — sections', () => {
	it('builds branch nodes whose child items are reachable through the collection walk', async () => {
		const r = mount(SectionedHarness);
		await act(() => {});

		// Real tree: the section renders its child items from the collection.
		const section = r.container.querySelector('section[data-key="s1"]')!;
		expect(keys(section)).toEqual(['x', 'y']);
		expect(keys(r.container)).toEqual(['x', 'y', 'z']);
		// `z` lives outside the section.
		expect(r.container.querySelector('ul > li[data-key="z"], ul li[data-key="z"]')).not.toBe(null);
		expect(section.querySelector('li[data-key="z"]')).toBe(null);

		const c = captured.collection;
		expect(c.getFirstKey()).toBe('s1');
		expect(c.getItem('s1').type).toBe('section');
		expect(c.getItem('s1').hasChildNodes).toBe(true);
		expect([...c.getChildren('s1')].map((n: any) => n.key)).toEqual(['x', 'y']);
		expect(c.getItem('x').parentKey).toBe('s1');
		// Flattened key order traverses INTO the branch and back out.
		expect(c.getKeyAfter('s1')).toBe('x');
		expect(c.getKeyAfter('x')).toBe('y');
		expect(c.getKeyAfter('y')).toBe('z');
		// Items only count toward size; the section itself does not.
		expect(c.size).toBe(3);
		r.unmount();
	});
});

describe('RAC collections engine — Hidden', () => {
	it('renders Hidden children off-document only', async () => {
		const r = mount(StandaloneHiddenHarness);
		await act(() => {});

		expect(r.container.querySelector('[data-live-probe]')).not.toBe(null);
		expect(r.container.querySelector('[data-hidden-probe]')).toBe(null);
		expect(document.querySelector('[data-hidden-probe]')).toBe(null);
		r.unmount();
	});

	it('createHideableComponent renders null inside hidden subtrees', async () => {
		const r = mount(HideableHarness);
		await act(() => {});

		const notes = [...r.container.querySelectorAll('em[data-note]')];
		expect(notes.length).toBe(1);
		expect(notes[0].textContent).toBe('visible');
		expect(document.body.textContent).not.toContain('never');
		r.unmount();
	});
});
