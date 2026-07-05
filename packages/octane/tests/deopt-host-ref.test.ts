import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { createElement, flushSync } from '../src/index.js';
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

// Regression: KEYED LIST items on the de-opt path (childSlot array mode → deoptItemBody,
// pure-host item held on `block.deoptNode`) never detached their refs on removal —
// reconcileKeyed's unmountBlock and batchClearItems (whose fast path skips unmountBlock
// entirely for a pure-host item) left `ref.current` pointing at the detached node. Same
// for a pure `hostNode` / hostElementBody root when the owning scope unmounts wholesale.
describe('de-opt keyed list / wholesale-unmount ref detach', () => {
	type Ref = { current: Element | null };
	const ref = (): Ref => ({ current: null });

	function KeyedList(props: any) {
		return props.items.map((it: any) =>
			createElement('li', { key: it.id, id: 'i' + it.id, ref: it.r }),
		);
	}

	function Gate(props: any) {
		return props.show ? createElement(props.comp, props.props) : null;
	}

	it('nulls a removed item ref, keeps the survivor attached (single removal)', () => {
		const a = { id: 1, r: ref() };
		const b = { id: 2, r: ref() };
		const m = mount(KeyedList as any, { items: [a, b] });
		expect(a.r.current).toBe(m.container.querySelector('#i1'));
		expect(b.r.current).toBe(m.container.querySelector('#i2'));

		m.root.render(KeyedList as any, { items: [a] });
		flushSync(() => {});
		expect(m.container.querySelector('#i2')).toBeNull();
		expect(b.r.current).toBeNull(); // removed item's ref detached
		expect(a.r.current).toBe(m.container.querySelector('#i1')); // survivor untouched
		m.unmount();
	});

	it('runs a removed item callback ref with null, without touching the survivor', () => {
		const calls: (Element | null)[] = [];
		const survivorCalls: (Element | null)[] = [];
		const a = { id: 1, r: (el: Element | null) => survivorCalls.push(el) };
		const b = { id: 2, r: (el: Element | null) => calls.push(el) };
		const m = mount(KeyedList as any, { items: [a, b] });
		expect(calls.at(-1)).not.toBeNull();
		expect(survivorCalls.length).toBe(1);

		m.root.render(KeyedList as any, { items: [a] });
		flushSync(() => {});
		expect(calls.at(-1)).toBeNull();
		expect(survivorCalls.length).toBe(1); // survivor's callback not re-cycled
		m.unmount();
	});

	it('nulls every ref on a full clear to [] (batchClearItems fast path)', () => {
		const a = { id: 1, r: ref() };
		const b = { id: 2, r: ref() };
		const m = mount(KeyedList as any, { items: [a, b] });
		expect(a.r.current).not.toBeNull();
		expect(b.r.current).not.toBeNull();

		m.root.render(KeyedList as any, { items: [] });
		flushSync(() => {});
		expect(m.container.querySelector('li')).toBeNull();
		expect(a.r.current).toBeNull();
		expect(b.r.current).toBeNull();
		m.unmount();
	});

	it('nulls old refs and attaches new ones on a full key replacement', () => {
		const a = { id: 1, r: ref() };
		const b = { id: 2, r: ref() };
		const c = { id: 3, r: ref() };
		const d = { id: 4, r: ref() };
		const m = mount(KeyedList as any, { items: [a, b] });

		m.root.render(KeyedList as any, { items: [c, d] });
		flushSync(() => {});
		expect(a.r.current).toBeNull();
		expect(b.r.current).toBeNull();
		expect(c.r.current).toBe(m.container.querySelector('#i3'));
		expect(d.r.current).toBe(m.container.querySelector('#i4'));
		m.unmount();
	});

	it('detaches NESTED descendant refs inside a removed item', () => {
		const outer = ref();
		const inner = ref();
		function Nested(props: any) {
			return props.items.map((it: any) =>
				createElement(
					'li',
					{ key: it.id, ref: it.r },
					createElement('span', { id: 's' + it.id, ref: it.inner }),
				),
			);
		}
		const m = mount(Nested as any, { items: [{ id: 1, r: outer, inner }] });
		expect(outer.current).not.toBeNull();
		expect(inner.current).toBe(m.container.querySelector('#s1'));

		m.root.render(Nested as any, { items: [] });
		flushSync(() => {});
		expect(outer.current).toBeNull();
		expect(inner.current).toBeNull();
		m.unmount();
	});

	it('detaches item refs when the list owner unmounts wholesale', () => {
		const a = { id: 1, r: ref() };
		const b = { id: 2, r: ref() };
		const props = { items: [a, b] };
		const m = mount(Gate as any, { show: true, comp: KeyedList, props });
		expect(a.r.current).not.toBeNull();

		m.root.render(Gate as any, { show: false, comp: KeyedList, props });
		flushSync(() => {});
		expect(a.r.current).toBeNull();
		expect(b.r.current).toBeNull();
		m.unmount();
	});

	it('detaches item refs on root unmount', () => {
		const a = { id: 1, r: ref() };
		const m = mount(KeyedList as any, { items: [a] });
		expect(a.r.current).not.toBeNull();
		m.unmount();
		expect(a.r.current).toBeNull();
	});

	it("detaches a pure hostNode's refs when the owning scope unmounts wholesale", () => {
		const outer = ref();
		const inner = ref();
		// Pure host subtree (no component descendants) → childSlot's `hostNode` path.
		function PureHost(props: any) {
			return createElement(
				'div',
				{ id: 'ph', ref: props.r },
				createElement('b', { ref: props.inner }),
			);
		}
		const m = mount(Gate as any, { show: true, comp: PureHost, props: { r: outer, inner } });
		expect(outer.current).toBe(m.container.querySelector('#ph'));
		expect(inner.current).not.toBeNull();

		m.root.render(Gate as any, { show: false, comp: PureHost, props: { r: outer, inner } });
		flushSync(() => {});
		expect(outer.current).toBeNull();
		expect(inner.current).toBeNull();
		m.unmount();
	});

	it("detaches a hostElementBody root's ref on wholesale unmount (host with component child)", () => {
		const r = ref();
		function Child() {
			return createElement('em', { children: 'x' });
		}
		// Host element WITH a component child → hostElementBody Block, element on deoptNode.
		function HostWithComp(props: any) {
			return createElement('div', { id: 'hw', ref: props.r }, createElement(Child));
		}
		const m = mount(Gate as any, { show: true, comp: HostWithComp, props: { r } });
		expect(r.current).toBe(m.container.querySelector('#hw'));

		m.root.render(Gate as any, { show: false, comp: HostWithComp, props: { r } });
		flushSync(() => {});
		expect(r.current).toBeNull();
		m.unmount();
	});
});
