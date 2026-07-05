import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { createElement } from '../src/index.js';
import { App } from './_fixtures/anchorless-host.tsrx';

// A LONE PURE-HOST descriptor at a value position (a pass-through component's
// return, a host descriptor rendered at a root) mounts ANCHORLESS — no comment
// markers, the element self-delimits (childSlot's analogue of componentSlot's
// singleRoot regime). RTL's `container.firstChild` idiom depends on this. When
// a later render flips the slot's value to any other mode, the slot promotes
// to the normal marked regime in place.

// React-style pass-through: whatever `children` value it's given is what the
// root renders — this is exactly @octanejs/testing-library's ValueRoot shim.
const Pass = (props: any) => props.children;

describe('anchorless lone pure-host value', () => {
	it('mounts with NO comment anchors — container.firstChild IS the element', () => {
		const r = mount(Pass, { children: createElement('div', { id: 'a' }, 'hello') });
		expect(r.container.innerHTML).toBe('<div id="a">hello</div>');
		expect(r.container.firstChild).toBe(r.find('#a'));
		r.unmount();
	});

	it('reconciles a same-tag re-render in place (node identity survives)', () => {
		const r = mount(Pass, { children: createElement('div', { id: 'a' }, 'one') });
		const node = r.container.firstChild;
		r.update(Pass, { children: createElement('div', { id: 'b' }, 'two') });
		expect(r.container.firstChild).toBe(node);
		expect(r.container.innerHTML).toBe('<div id="b">two</div>');
		r.unmount();
	});

	it('rebuilds on a tag flip, still anchorless', () => {
		const r = mount(Pass, { children: createElement('div', undefined, 'div') });
		r.update(Pass, { children: createElement('span', undefined, 'span') });
		expect(r.container.innerHTML).toBe('<span>span</span>');
		r.unmount();
	});

	it('attaches the ref on mount and detaches it when the value flips away', () => {
		const ref: { current: Element | null } = { current: null };
		const r = mount(Pass, { children: createElement('div', { ref }) });
		expect(ref.current).toBe(r.container.firstChild);
		r.update(Pass, { children: 'text' });
		expect(ref.current).toBe(null);
		expect(r.container.textContent).toBe('text');
		r.unmount();
	});

	it('detaches the ref on root unmount', () => {
		const ref: { current: Element | null } = { current: null };
		const r = mount(Pass, { children: createElement('div', { ref }) });
		expect(ref.current).not.toBe(null);
		r.unmount();
		expect(ref.current).toBe(null);
		expect(r.container.innerHTML).toBe('');
	});
});

// The promotion cases: an anchorless slot whose value flips mode must mint its
// marker pair IN PLACE — content stays between the fixture's <b>A</b>/<b>B</b>
// siblings — and flipping back to a host renders correctly in the (now marked)
// regime. `section.textContent` proves both content and document order.
describe('anchorless → marked promotion on mode flips', () => {
	function flipRoundTrip(mode: string, expected: string, target?: HTMLElement) {
		const r = mount(App, { mode: 'host', target });
		expect(r.find('section').textContent).toBe('AhostB');
		expect(r.container.querySelector('#host')).not.toBe(null);

		r.update(App, { mode, target });
		expect(r.container.querySelector('#host')).toBe(null); // old node swept
		expect(r.find('section').textContent).toBe(expected);

		r.update(App, { mode: 'host', target });
		expect(r.find('section').textContent).toBe('AhostB');
		expect(r.container.querySelector('#host')).not.toBe(null);
		r.unmount();
	}

	it('host → text → host', () => flipRoundTrip('text', 'AplainB'));
	it('host → null → host', () => flipRoundTrip('null', 'AB'));
	it('host → keyed array → host', () => flipRoundTrip('array', 'AabB'));

	// Return-slot KIND flip: childSlot (anchorless host) ⇄ componentSlotSlot
	// (singleRoot `<Solo/>`) — exercises disposeReturnSlot's teardown of an
	// anchorless childSlot (no markers to sweep; the node itself is removed).
	it('host → singleRoot component → host', () => flipRoundTrip('comp', 'AsoloB'));

	// Host WITH component children needs Blocks → the component path, not the
	// raw reconciler; the anchorless slot promotes and mounts it as a Block.
	it('host → host-with-component-children → host', () => flipRoundTrip('hostcomp', 'AdeepB'));

	it('host → portal → host (content moves to the foreign target and back)', () => {
		const target = document.createElement('aside');
		document.body.appendChild(target);
		try {
			const r = mount(App, { mode: 'host', target });
			expect(r.find('section').textContent).toBe('AhostB');

			r.update(App, { mode: 'portal', target });
			expect(r.container.querySelector('#host')).toBe(null);
			expect(r.find('section').textContent).toBe('AB'); // slot itself is empty
			expect(target.querySelector('.solo')!.textContent).toBe('portal');

			r.update(App, { mode: 'host', target });
			expect(target.querySelector('.solo')).toBe(null); // portal torn down
			expect(r.find('section').textContent).toBe('AhostB');
			r.unmount();
		} finally {
			target.remove();
		}
	});
});
