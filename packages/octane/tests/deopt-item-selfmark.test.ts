import { describe, it, expect } from 'vitest';
import { createElement } from '../src/index.js';
import { mount } from './_helpers';

// Marker-elision M4: PURE single-element de-opt list items SELF-MARK — the
// rendered element is the item block's start === end marker, no `<!--it-->`
// pair (the forBlock-singleRoot regime, decided per item VALUE at mount via
// reconcileKeyed's `2` sentinel). Component-bearing / null / primitive items
// keep their pair; a self-marked item whose value later stops fitting one raw
// element PROMOTES one-way to a minted pair in place (deoptItemBody). These
// tests pin the risky paths: reorder, tag-change rebuild (the item element IS
// the insert anchor), the promotion flips, and teardown.

function comments(root: Node): number {
	const w = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	let n = 0;
	while (w.nextNode()) n++;
	return n;
}

function Chip(props: any) {
	return createElement('mark', { id: props.id }, props.label);
}

// A keyed de-opt list through a value hole: `items` maps straight to
// descriptors (the recharts shape). A component must exist SOMEWHERE in the
// tree for the de-opt BLOCK path (childSlot array mode → reconcileKeyed) to
// engage at all — an all-pure tree is diffed raw by the host reconciler with
// no markers to begin with. The trailing `chip('z')` provides that, and also
// pins a PAIRED item coexisting with self-marked siblings.
function List(props: any) {
	return createElement(
		'ul',
		{ id: 'l' },
		props.items.map((it: any) => it.body),
	);
}

const li = (k: string, label = k) => ({
	key: k,
	body: createElement('li', { key: k, id: k }, label),
});
const section = (k: string) => ({
	key: k,
	body: createElement('section', { key: k, id: k }, 's:' + k),
});
const chip = (k: string) => ({
	key: k,
	body: createElement(Chip, { key: k, id: k, label: 'c:' + k }),
});
const hole = (k: string) => ({ key: k, body: null });

describe('de-opt keyed items: self-marking (M4)', () => {
	it('pure single-element items mount with NO per-item pair', () => {
		const m = mount(List as any, { items: [li('a'), li('b'), li('c'), chip('z')] });
		const ul = m.find('#l');
		expect(ul.querySelectorAll('li').length).toBe(3);
		// The list's own for-slot pair (2) + the COMPONENT item z's pair (2);
		// zero `it` pairs for the three pure items. Pre-M4: 2 + 4×2 = 10.
		expect(comments(ul)).toBe(4);
		m.unmount();
	});

	it('keyed reorder moves the SAME elements (self-marked ranges)', () => {
		const m = mount(List as any, { items: [li('a'), li('b'), li('c'), chip('z')] });
		const ul = m.find('#l');
		const [ea, eb, ec] = [m.find('#a'), m.find('#b'), m.find('#c')];
		m.update(List as any, { items: [li('c'), li('a'), li('b'), chip('z')] });
		expect(Array.from(ul.querySelectorAll('li')).map((e) => e.id)).toEqual(['c', 'a', 'b']);
		// Identity preserved — reorder moved nodes, didn't rebuild them.
		expect(m.find('#a')).toBe(ea);
		expect(m.find('#b')).toBe(eb);
		expect(m.find('#c')).toBe(ec);
		expect(comments(ul)).toBe(4);
		m.unmount();
	});

	it('tag-change rebuild replaces the element in place (element IS the marker)', () => {
		const m = mount(List as any, { items: [li('a'), li('b'), chip('z')] });
		const ul = m.find('#l');
		m.update(List as any, { items: [section('a'), li('b'), chip('z')] });
		const kids = Array.from(ul.children);
		expect(kids.map((e) => e.tagName.toLowerCase())).toEqual(['section', 'li', 'mark']);
		expect(m.find('#a').textContent).toBe('s:a');
		expect(comments(ul)).toBe(4);
		// And back — still in place, still no pair.
		m.update(List as any, { items: [li('a', 'a2'), li('b'), chip('z')] });
		expect(Array.from(ul.children).map((e) => e.tagName.toLowerCase())).toEqual([
			'li',
			'li',
			'mark',
		]);
		expect(m.find('#a').textContent).toBe('a2');
		expect(comments(ul)).toBe(4);
		m.unmount();
	});

	it('pure → component flip PROMOTES to a minted pair, one-way', () => {
		const m = mount(List as any, { items: [li('a'), li('b'), chip('z')] });
		const ul = m.find('#l');
		expect(comments(ul)).toBe(4);
		m.update(List as any, { items: [chip('a'), li('b'), chip('z')] });
		expect(m.find('#a').textContent).toBe('c:a');
		expect(m.find('#a').tagName.toLowerCase()).toBe('mark');
		// Item `a` promoted: +2 (`it` pair) — the component mounts between them.
		expect(comments(ul)).toBe(6);
		expect(Array.from(ul.children).map((e) => e.id)).toEqual(['a', 'b', 'z']);
		// Back to pure: the pair stays (one-way), content reconciles inside it.
		m.update(List as any, { items: [li('a'), li('b'), chip('z')] });
		expect(m.find('#a').tagName.toLowerCase()).toBe('li');
		expect(comments(ul)).toBe(6);
		expect(Array.from(ul.children).map((e) => e.id)).toEqual(['a', 'b', 'z']);
		m.unmount();
	});

	it('pure → null flip promotes and renders nothing; null → pure comes back', () => {
		// POSITIONAL list (keyless descriptors): a null can't carry a key, so the
		// desc→null flip at a stable slot only exists under index keys — which is
		// exactly where the self-marked block's PROMOTION must fire (same block,
		// new value shape).
		const pli = (id: string, label = id) => createElement('li', { id }, label);
		const pchip = (id: string) => createElement(Chip, { id, label: 'c:' + id });
		const m = mount(List as any, {
			items: [pli('a'), pli('b'), pchip('z')].map((body) => ({ body })),
		});
		const ul = m.find('#l');
		expect(comments(ul)).toBe(4);
		m.update(List as any, { items: [{ body: null }, { body: pli('b') }, { body: pchip('z') }] });
		expect(ul.querySelectorAll('li').length).toBe(1);
		expect(m.container.querySelector('#a')).toBeNull();
		// Slot 0 promoted to an (empty) `it` pair — empties keep their index slot.
		expect(comments(ul)).toBe(6);
		m.update(List as any, {
			items: [{ body: pli('a') }, { body: pli('b') }, { body: pchip('z') }],
		});
		expect(Array.from(ul.querySelectorAll('li')).map((e) => e.id)).toEqual(['a', 'b']);
		expect(comments(ul)).toBe(6);
		m.unmount();
	});

	it('removal + teardown clean up self-marked elements', () => {
		const m = mount(List as any, { items: [li('a'), li('b'), li('c'), chip('z')] });
		const ul = m.find('#l');
		m.update(List as any, { items: [li('b'), chip('z')] });
		expect(Array.from(ul.querySelectorAll('li')).map((e) => e.id)).toEqual(['b']);
		expect(comments(ul)).toBe(4);
		m.update(List as any, { items: [] });
		// The LAST component left the tree, so the whole value flipped
		// needs-blocks → pure-host: the return slot rebuilds the ul RAW (the
		// old one — markers and all — is discarded). Re-find and expect a
		// markerless empty element.
		const freshUl = m.find('#l');
		expect(freshUl.querySelectorAll('li').length).toBe(0);
		expect(m.container.querySelector('#z')).toBeNull();
		expect(comments(freshUl)).toBe(0);
		const html = m.html();
		m.unmount();
		expect(html).toContain('<ul id="l">');
	});
});
