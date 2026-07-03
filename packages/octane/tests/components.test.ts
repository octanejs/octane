import { describe, it, expect } from 'vitest';
import { createElement, useState, template, clone } from 'octane';
import { mount, act } from './_helpers';
import {
	Greeting,
	App,
	Nested,
	DefaultOnly,
	ArrowComp,
	ArrowFragHost,
} from './_fixtures/components.tsrx';

describe('component composition', () => {
	it('renders a static child component with props', () => {
		const r = mount(Greeting, { name: 'world' });
		expect(r.find('.lbl').textContent).toBe('world');
		r.unmount();
	});

	it('renders an arrow-function component (const X = (props) => @{…})', () => {
		const r = mount(ArrowComp, { who: 'world' });
		expect(r.find('#arrow').textContent).toBe('hi world');
		r.unmount();
	});

	it('renders an arrow component with a fragment body + nested components', () => {
		const r = mount(ArrowFragHost);
		expect(r.find('#arrow').textContent).toBe('hi arrow');
		expect(r.find('.lbl').textContent).toBe('sibling');
		r.unmount();
	});
});

describe('createContext + use', () => {
	it('reads default when no Provider is in the tree', () => {
		const r = mount(DefaultOnly);
		expect(r.find('.theme').textContent).toBe('light');
		r.unmount();
	});

	it('reads Provider value, updates when value changes', () => {
		const r = mount(App);
		expect(r.find('.theme').textContent).toBe('light');
		r.click('button');
		expect(r.find('.theme').textContent).toBe('dark');
		r.click('button');
		expect(r.find('.theme').textContent).toBe('light');
		r.unmount();
	});

	it('inner Provider overrides outer', () => {
		const r = mount(Nested);
		expect(r.find('.o .theme').textContent).toBe('outer');
		expect(r.find('.i .theme').textContent).toBe('inner');
		r.unmount();
	});
});

// ─── Key-driven remount on standalone component ───
import { flushEffects } from './_helpers';
import { KeyHost, resetKeyCounters } from './_fixtures/components.tsrx';
import * as fx from './_fixtures/components.tsrx';

describe('key-driven remount on standalone component', () => {
	it('resets useState when key changes', () => {
		const r = mount(KeyHost, { k: 'a', label: 'A' });
		r.click('.inc');
		r.click('.inc');
		r.click('.inc');
		expect(r.find('.count').textContent).toBe('3');
		r.update(KeyHost, { k: 'b', label: 'B' });
		// Fresh Counter — useState slot is new.
		expect(r.find('.count').textContent).toBe('0');
		expect(r.find('.label').textContent).toBe('B');
		r.unmount();
	});

	it('fires useEffect cleanup on key change and re-runs the mount effect', () => {
		resetKeyCounters();
		const r = mount(KeyHost, { k: 'a', label: 'A' });
		flushEffects();
		expect(fx.mountCount).toBe(1);
		expect(fx.cleanupCount).toBe(0);
		r.update(KeyHost, { k: 'b', label: 'B' });
		flushEffects();
		expect(fx.mountCount).toBe(2);
		expect(fx.cleanupCount).toBe(1);
		r.update(KeyHost, { k: 'c', label: 'C' });
		flushEffects();
		expect(fx.mountCount).toBe(3);
		expect(fx.cleanupCount).toBe(2);
		r.unmount();
		flushEffects();
		expect(fx.cleanupCount).toBe(3);
	});

	it('same key + different props re-renders in place (no remount)', () => {
		resetKeyCounters();
		const r = mount(KeyHost, { k: 'stable', label: 'first' });
		flushEffects();
		r.click('.inc');
		r.click('.inc');
		expect(r.find('.count').textContent).toBe('2');
		expect(fx.mountCount).toBe(1);
		// Same key, new label — should not remount.
		r.update(KeyHost, { k: 'stable', label: 'second' });
		flushEffects();
		expect(r.find('.count').textContent).toBe('2'); // state preserved
		expect(r.find('.label').textContent).toBe('second'); // prop updated
		expect(fx.mountCount).toBe(1); // no remount
		expect(fx.cleanupCount).toBe(0);
		r.unmount();
	});
});

// Library-binding shape, hand-written (no compiler): a plain function component
// RETURNS a `createElement` descriptor whose `type` is a compiled-style imperative
// renderer (mounts once, patches holes on re-render). renderBlock childSlots the
// return; childSlot reconciles by `type` IDENTITY — so on re-render the SAME
// button + text node survive (holes patched, not rebuilt). Non-VDOM proof for the
// descriptor-returning path the `@octanejs/*` bindings rely on.
describe('hand-written descriptor renderer (return-based body, no compiler)', () => {
	// The compiled imperative renderer for `<button onClick={onInc}>{n}</button>`.
	const _btn = template('<button></button>');
	function CountButtonFrag(props: any, __s: any) {
		const __block = __s.block;
		let _b = __s.b$0;
		if (_b === undefined) {
			_b = {};
			const el = clone(_btn) as HTMLButtonElement;
			const txt = document.createTextNode(String(props.n));
			el.appendChild(txt);
			el.onclick = props.onInc;
			_b.el = el;
			_b.txt = txt;
			_b.n = props.n;
			__block.parentNode.insertBefore(el, __block.endMarker);
			__s.b$0 = _b;
		} else {
			if (_b.n !== props.n) {
				_b.txt.data = String(props.n);
				_b.n = props.n;
			}
			_b.el.onclick = props.onInc; // latest closure
		}
	}

	// "Just a function" — has a hook (manual stable slot), RETURNS a descriptor.
	const SLOT = Symbol.for('poc:Count.useState#0');
	function Count(): any {
		const [n, setN] = useState(0, SLOT);
		return createElement(CountButtonFrag, { n, onInc: () => setN(n + 1) });
	}

	it('mounts via the return and PATCHES (same node) on re-render — no rebuild/VDOM', () => {
		const r = mount(Count as any);
		const btn = r.container.querySelector('button')!;
		const txt = btn.firstChild;
		expect(btn.textContent).toBe('0');

		act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));

		expect(btn.textContent).toBe('1');
		// The LINCHPIN: identity preserved → reconciled in place, not rebuilt.
		expect(r.container.querySelector('button')).toBe(btn);
		expect(btn.firstChild).toBe(txt);

		act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		expect(btn.textContent).toBe('2');
		expect(r.container.querySelector('button')).toBe(btn);
		r.unmount();
	});
});
