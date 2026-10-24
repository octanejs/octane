import { describe, it, expect } from 'vitest';
import { act } from './_helpers';
import { createElement, createRoot } from '../src/index.js';
import { StoredInArm, StoredInArmParent } from './_fixtures/deopt-lite-arm-owner.tsrx';

// Regression (#2233): a de-opt host committed inside a lite @if arm recorded the arm's
// stand-in as its commit owner, and commitInScope read `.block.idState` off it.
describe('de-opt host inside a lite @if arm', () => {
	function render(element: unknown) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		act(() => root.render(element as any));
		return {
			container,
			root,
			unmount() {
				act(() => root.unmount());
				container.remove();
			},
		};
	}

	it('re-renders a stored array-class element next to new children', () => {
		const r = render(createElement(StoredInArm, null, createElement('span', null, 'a')));
		act(() => r.root.render(createElement(StoredInArm, null, createElement('span', null, 'b'))));
		expect(r.container.querySelector('label')!.className).toBe('a');
		expect(r.container.textContent).toBe('Nb');
		act(() => r.root.render(createElement(StoredInArm, { h: true })));
		expect(r.container.textContent).toBe('x');
		r.unmount();
	});

	it('re-renders when a compiled parent passes new children', () => {
		const r = render(createElement(StoredInArmParent, { label: 'a' }));
		act(() => r.root.render(createElement(StoredInArmParent, { label: 'b' })));
		expect(r.container.textContent).toBe('Nb');
		r.unmount();
	});
});
