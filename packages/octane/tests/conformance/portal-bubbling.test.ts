/**
 * Portal event bubbling through nested portals — extends tests/portal-events.ts
 * (single-level bubble-out) to the portal-within-a-portal case. Octane bubbles
 * delegated events along the LOGICAL tree, not the DOM tree, by stamping
 * `$$portalParent` on portal content (runtime.ts:2915 / :3119). The contract
 * mirrors React's per-fiber portal walk: a click inside a deeply portaled node
 * fires every handler on its logical-ancestor path.
 *
 * Conceptually ports the portal cases from
 * react-dom/src/__tests__/ReactDOMEventPropagation-test.js (every `onX` case
 * dispatches through a portal and asserts the React-parent handler fires).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { NestedPortals } from '../_fixtures/portal-bubbling.tsrx';

function makeTarget(id: string): HTMLElement {
	const el = document.createElement('div');
	el.id = id;
	document.body.appendChild(el);
	return el;
}

describe('portal event bubbling — nested portals', () => {
	it('a click in a doubly-portaled node bubbles through both logical parents', () => {
		const targetA = makeTarget('targetA');
		const targetB = makeTarget('targetB');
		const r = mount(NestedPortals, { targetA, targetB });

		// The deep button physically lives in targetB.
		const deep = targetB.querySelector('.deep') as HTMLElement;
		expect(deep).toBeTruthy();

		deep.click();

		// btn (own handler) -> mid (inner portal's host, in targetA) -> root
		// (outer portal's host, in the app container). All three fire, in order.
		expect(r.find('.trail').textContent).toBe('btn,mid,root,');

		r.unmount();
		targetA.remove();
		targetB.remove();
	});

	it('stopPropagation at the middle logical parent halts the bubble before root', () => {
		const targetA = makeTarget('targetA');
		const targetB = makeTarget('targetB');
		const r = mount(NestedPortals, { targetA, targetB, stopAtMid: true });

		const deep = targetB.querySelector('.deep') as HTMLElement;
		deep.click();

		// btn fires, mid fires and cancels bubbling, root never sees it.
		expect(r.find('.trail').textContent).toBe('btn,mid,');

		r.unmount();
		targetA.remove();
		targetB.remove();
	});
});
