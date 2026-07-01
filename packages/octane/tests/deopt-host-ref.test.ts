import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { flushSync } from '../src/index.js';
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
