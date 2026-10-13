import { describe, it, expect } from 'vitest';
import { createElement, createRoot, Suspense, startTransition, use } from '../src/index.js';
import { act, mount } from './_helpers';

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
		// The ul owns the list, so only component item z needs a pair (2).
		// The three self-marked hosts and the list need no separate markers.
		expect(comments(ul)).toBe(2);
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
		expect(comments(ul)).toBe(2);
		m.unmount();
	});

	it('tag-change rebuild replaces the element in place (element IS the marker)', () => {
		const m = mount(List as any, { items: [li('a'), li('b'), chip('z')] });
		const ul = m.find('#l');
		m.update(List as any, { items: [section('a'), li('b'), chip('z')] });
		const kids = Array.from(ul.children);
		expect(kids.map((e) => e.tagName.toLowerCase())).toEqual(['section', 'li', 'mark']);
		expect(m.find('#a').textContent).toBe('s:a');
		expect(comments(ul)).toBe(2);
		// And back — still in place, still no pair.
		m.update(List as any, { items: [li('a', 'a2'), li('b'), chip('z')] });
		expect(Array.from(ul.children).map((e) => e.tagName.toLowerCase())).toEqual([
			'li',
			'li',
			'mark',
		]);
		expect(m.find('#a').textContent).toBe('a2');
		expect(comments(ul)).toBe(2);
		m.unmount();
	});

	it('pure → component flip PROMOTES to a minted pair, one-way', () => {
		const m = mount(List as any, { items: [li('a'), li('b'), chip('z')] });
		const ul = m.find('#l');
		expect(comments(ul)).toBe(2);
		m.update(List as any, { items: [chip('a'), li('b'), chip('z')] });
		expect(m.find('#a').textContent).toBe('c:a');
		expect(m.find('#a').tagName.toLowerCase()).toBe('mark');
		// Item `a` promoted: +2 (`it` pair) — the component mounts between them.
		expect(comments(ul)).toBe(4);
		expect(Array.from(ul.children).map((e) => e.id)).toEqual(['a', 'b', 'z']);
		// Back to pure: the pair stays (one-way), content reconciles inside it.
		m.update(List as any, { items: [li('a'), li('b'), chip('z')] });
		expect(m.find('#a').tagName.toLowerCase()).toBe('li');
		expect(comments(ul)).toBe(4);
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
		expect(comments(ul)).toBe(2);
		m.update(List as any, { items: [{ body: null }, { body: pli('b') }, { body: pchip('z') }] });
		expect(ul.querySelectorAll('li').length).toBe(1);
		expect(m.container.querySelector('#a')).toBeNull();
		// Slot 0 promoted to an (empty) `it` pair — empties keep their index slot.
		expect(comments(ul)).toBe(4);
		m.update(List as any, {
			items: [{ body: pli('a') }, { body: pli('b') }, { body: pchip('z') }],
		});
		expect(Array.from(ul.querySelectorAll('li')).map((e) => e.id)).toEqual(['a', 'b']);
		expect(comments(ul)).toBe(4);
		m.unmount();
	});

	it('removal + teardown clean up self-marked elements', () => {
		const m = mount(List as any, { items: [li('a'), li('b'), li('c'), chip('z')] });
		const ul = m.find('#l');
		m.update(List as any, { items: [li('b'), chip('z')] });
		expect(Array.from(ul.querySelectorAll('li')).map((e) => e.id)).toEqual(['b']);
		expect(comments(ul)).toBe(2);
		m.update(List as any, { items: [] });
		// The final component left the tree. Its owned rows are removed and
		// the original host remains empty, without enclosing list markers.
		const freshUl = m.find('#l');
		expect(freshUl.querySelectorAll('li').length).toBe(0);
		expect(m.container.querySelector('#z')).toBeNull();
		expect(comments(freshUl)).toBe(0);
		const html = m.html();
		m.unmount();
		expect(html).toContain('<ul id="l">');
	});

	it('removes its own custom host even if connecting it appends a foreign sibling', () => {
		let foreign: Element | null = null;
		customElements.define(
			'selfmark-with-foreign-tail',
			class extends HTMLElement {
				connectedCallback() {
					if (foreign === null) {
						foreign = document.createElement('li');
						foreign.id = 'foreign';
						foreign.textContent = 'outside the list';
						this.parentNode!.appendChild(foreign);
					}
				}
			},
		);
		// The chip selects the block-bearing renderer. The appended custom host
		// is the last owned row, so it needs no enclosing list anchor.
		const custom = {
			key: 'custom',
			body: createElement('selfmark-with-foreign-tail', { key: 'custom', id: 'custom' }),
		};
		const m = mount(List as any, { items: [chip('z')] });
		const host = m.find('#l');
		m.update(List as any, { items: [chip('z'), custom] });
		const row = m.find('#custom');
		expect(host.querySelector('#foreign')).toBe(foreign);
		m.update(List as any, { items: [chip('z')] });
		expect(row.parentNode).toBeNull();
		expect(host.querySelector('#foreign')).toBe(foreign);
		expect(m.find('#z').textContent).toBe('c:z');
		m.unmount();
	});

	it('does not reconnect correct rows across a foreign tail when an appended row cannot commit', async () => {
		const connections: string[] = [];
		customElements.define(
			'selfmark-held-row',
			class extends HTMLElement {
				connectedCallback() {
					connections.push('connected:' + this.id);
				}
				disconnectedCallback() {
					connections.push('disconnected:' + this.id);
				}
			},
		);
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => (resolve = done));
		const ready = Object.assign(Promise.resolve('ready'), {
			status: 'fulfilled',
			value: 'ready',
		});
		function Reader(props: { load: Promise<string> }) {
			return createElement('output', {}, use(props.load));
		}
		function App(props: { later: boolean }) {
			const row = (id: string) => ({
				key: id,
				body: createElement('selfmark-held-row', { id, key: id }),
			});
			return createElement(
				Suspense,
				{ fallback: createElement('p', { id: 'pending' }, 'waiting') },
				createElement(List, {
					items: props.later ? [chip('z'), row('a'), row('b')] : [chip('z'), row('a')],
				}),
				createElement(Reader, { load: props.later ? pending : ready }),
			);
		}
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			await act(() => root.render(App, { later: false }));
			const host = container.querySelector('#l')!;
			const row = host.querySelector('#a');
			const foreign = document.createElement('aside');
			foreign.textContent = 'independent';
			host.appendChild(foreign);
			connections.length = 0;

			await act(() => startTransition(() => root.render(App, { later: true })));
			expect(container.querySelector('#pending')).toBeNull();
			expect(container.querySelector('#l')).toBe(host);
			expect(host.querySelector('#a')).toBe(row);
			expect(host.querySelector('#b')).toBeNull();
			expect(foreign.parentNode).toBe(host);
			expect(connections.filter((event) => event.endsWith(':a'))).toEqual([]);

			await act(() => resolve('done'));
			expect(host.querySelector('#a')).toBe(row);
			expect(host.querySelector('#b')).not.toBeNull();
			expect(foreign.parentNode).toBe(host);
		} finally {
			resolve('done');
			root.unmount();
			container.remove();
		}
	});
});
