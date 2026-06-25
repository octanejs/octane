/**
 * P0: prove the return-based-body model is NON-VDOM.
 * A function RETURNS a descriptor whose `type` is a COMPILED renderer (CountButtonFrag).
 * renderBlock childSlots the return; childSlot reconciles by `type` identity. On
 * re-render we assert the SAME button + text node survive (holes patched, not rebuilt).
 */
import { describe, it, expect } from 'vitest';
import { createElement, useState, template, clone } from 'octane';
import { mount, act } from './_helpers';

// The compiled imperative renderer for `<button onClick={onInc}>{n}</button>`.
// Mounts once (clone template + bind), then PATCHES holes on re-render.
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

// "Just a function" — has a hook, RETURNS a fragment descriptor. No @{}, no gate.
const SLOT = Symbol.for('poc:Count.useState#0');
function Count(): any {
	const [n, setN] = useState(0, SLOT);
	return createElement(CountButtonFrag, { n, onInc: () => setN(n + 1) });
}

describe('P0: return-based body + compiled-fragment descriptor', () => {
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
