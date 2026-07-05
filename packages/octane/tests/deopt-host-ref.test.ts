import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { flushSync } from '../src/index.js';
import { createElement } from '../src/index.js';
import { RefHost } from './_fixtures/deopt-host-ref.tsrx';

// Regression: a value-position host descriptor (`{cond ? <span ref={r}/> : null}`) goes through
// the de-opt renderer. When the node is removed (or its ref changes), the object/callback ref
// must be DETACHED — previously `removeDeoptProp` no-op'd `ref` and `clearChildContent` removed
// the node without detaching, leaving `ref.current` pointing at a node no longer in the DOM.
describe('de-opt host descriptor refs are detached on removal', () => {
	it('nulls an object ref when the host node is removed', () => {
		const r: { current: Element | null } = { current: null };
		const m = mount(RefHost as any, { show: true, r });
		expect(r.current).not.toBeNull();
		expect((r.current as Element).id).toBe('d');
		expect(m.container.querySelector('#d')).toBe(r.current);

		m.root.render(RefHost as any, { show: false, r });
		flushSync(() => {});

		expect(m.container.querySelector('#d')).toBeNull(); // node removed
		expect(r.current).toBeNull(); // ref detached (not dangling)
		m.unmount();
	});

	it('runs a callback ref with null when the host node is removed', () => {
		const calls: (Element | null)[] = [];
		const cb = (el: Element | null) => calls.push(el);
		const m = mount(RefHost as any, { show: true, r: cb });
		expect(calls.at(-1)).not.toBeNull();

		m.root.render(RefHost as any, { show: false, r: cb });
		flushSync(() => {});

		expect(calls.at(-1)).toBeNull(); // callback invoked with null on removal
		m.unmount();
	});
});

// Regression: removal detached ONLY the top-level node's ref — every element built by
// reconcileDeoptNode is DEOPT_DESC-stamped, so removing a pure-host TREE must walk it
// (detachDeoptTreeRefs) and detach refs on nested descendants too. Built with runtime
// `createElement` (not `.tsrx`) so the trees actually reach the de-opt reconciler —
// the compiler folds template ternaries into the fast path.

// The whole return value flips pure-host tree ⟷ null: removal sweeps the tree out of
// the component's return slot (clearChildContent).
function WholeTree(props: any) {
	return props.show
		? createElement('div', {
				id: 'outer',
				children: createElement('p', {
					children: createElement('span', { id: 'inner', ref: props.r }),
				}),
			})
		: null;
}

// Stable pure-host root whose CHILD subtree flips: removal goes through
// reconcileDeoptChildren's not-reused sweep.
function ChildTree(props: any) {
	return createElement('div', {
		id: 'wrap',
		children: props.show
			? createElement('div', {
					id: 'outer',
					children: createElement('span', { id: 'inner', ref: props.r }),
				})
			: null,
	});
}

function ListTree(props: any) {
	return createElement('ul', {
		id: 'list',
		children: props.items.map((item: any) =>
			createElement('li', {
				key: item.id,
				children: createElement('span', { id: 's' + item.id, ref: item.r }),
			}),
		),
	});
}

describe('de-opt removal detaches refs on NESTED descendants', () => {
	it('nulls a nested object ref when the whole tree toggles to null', () => {
		const r: { current: Element | null } = { current: null };
		const m = mount(WholeTree as any, { show: true, r });
		expect((r.current as Element | null)?.id).toBe('inner');

		m.root.render(WholeTree as any, { show: false, r });
		flushSync(() => {});

		expect(m.container.querySelector('#outer')).toBeNull(); // tree removed
		expect(r.current).toBeNull(); // nested ref detached (was left dangling)
		m.unmount();
	});

	it('runs a nested callback ref with null when the tree is removed', () => {
		const calls: (Element | null)[] = [];
		const cb = (el: Element | null) => calls.push(el);
		const m = mount(WholeTree as any, { show: true, r: cb });
		expect(calls.at(-1)).not.toBeNull();

		m.root.render(WholeTree as any, { show: false, r: cb });
		flushSync(() => {});

		expect(calls.at(-1)).toBeNull();
		m.unmount();
	});

	it('runs a nested React-19 callback-ref CLEANUP when the tree is removed', () => {
		const log: string[] = [];
		const cb = (el: Element) => {
			log.push('attach:' + el.id);
			return () => log.push('cleanup');
		};
		const m = mount(WholeTree as any, { show: true, r: cb });
		expect(log).toEqual(['attach:inner']);

		m.root.render(WholeTree as any, { show: false, r: cb });
		flushSync(() => {});

		expect(log).toEqual(['attach:inner', 'cleanup']); // cleanup, NOT cb(null)
		m.unmount();
	});

	it('nulls a nested ref when a CHILD subtree of a reused parent is removed', () => {
		const r: { current: Element | null } = { current: null };
		const m = mount(ChildTree as any, { show: true, r });
		expect((r.current as Element | null)?.id).toBe('inner');

		m.root.render(ChildTree as any, { show: false, r });
		flushSync(() => {});

		expect(m.container.querySelector('#wrap')).not.toBeNull(); // parent reused
		expect(m.container.querySelector('#outer')).toBeNull(); // subtree removed
		expect(r.current).toBeNull();
		m.unmount();
	});

	it('does NOT fire refs across an internal pure⟷Blocks flip of the same host tag', () => {
		// The tree root stays `<div><ol ref/>…</div>`; only a component child appears/
		// disappears, flipping childSlot between the pure-host and Blocks strategies.
		// React would never remount here, so the ref must not see `null` mid-flip —
		// a `ref={setState}` that gates the flipping child would otherwise loop forever
		// (the portal-into-deopt-host shape). It MAY re-fire with the rebuilt element.
		const calls: (string | null)[] = [];
		const cb = (el: Element | null) => calls.push(el === null ? null : el.tagName);
		function Leaf() {
			return createElement('em', { children: 'x' });
		}
		function FlipTree(props: any) {
			return createElement('div', {
				id: 'wrap',
				children: createElement('ol', {
					id: 'list',
					ref: cb,
					children: props.comp ? createElement(Leaf, {}) : null,
				}),
			});
		}
		const m = mount(FlipTree as any, { comp: false });
		expect(calls).toEqual(['OL']);

		m.root.render(FlipTree as any, { comp: true }); // pure → Blocks
		flushSync(() => {});
		m.root.render(FlipTree as any, { comp: false }); // Blocks → pure
		flushSync(() => {});

		expect(calls).not.toContain(null); // no unmount-style null firing mid-flip
		expect(m.container.querySelector('#list')).not.toBeNull();
		m.unmount();
	});

	it('detaches a nested ref when a keyed array child is removed', () => {
		const r1: { current: Element | null } = { current: null };
		const r2: { current: Element | null } = { current: null };
		const items = [
			{ id: 1, r: r1 },
			{ id: 2, r: r2 },
		];
		const m = mount(ListTree as any, { items });
		expect((r1.current as Element | null)?.id).toBe('s1');
		expect((r2.current as Element | null)?.id).toBe('s2');

		m.root.render(ListTree as any, { items: [items[0]] });
		flushSync(() => {});

		expect(m.container.querySelector('#s2')).toBeNull(); // item removed
		expect(r2.current).toBeNull(); // its nested ref detached
		expect((r1.current as Element | null)?.id).toBe('s1'); // survivor untouched
		m.unmount();
	});
});
