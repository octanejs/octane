import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { flushSync } from '../src/index.js';
import { HostChildrenApp } from './_fixtures/host-children.tsrx';

// Regression: a `.tsrx` parent passing children to a `.ts` component that forwards them
// onto a HOST element via createElement (e.g. @octanejs/floating-ui's FloatingOverlay).
// (1) descNeedsBlocks must treat the render-fn children as needing Blocks so they render
//     at all; (2) childSlot must reconcile a bare render-fn child by SLOT (update in
//     place), not by identity — otherwise the child re-mounts every parent render (losing
//     state, and looping unboundedly once effects re-render).
describe('host element children from a .tsrx parent (render-fn interop)', () => {
	it('renders the children AND preserves child state across parent re-renders', () => {
		let bumpChild!: () => void;
		let bumpParent!: () => void;
		const r = mount(HostChildrenApp as any, {
			bind: (f: () => void) => (bumpChild = f),
			bindParent: (f: () => void) => (bumpParent = f),
		});
		// (1) children rendered through the host element.
		const wrap = r.container.querySelector('.wrap')!;
		expect(wrap).toBeTruthy();
		expect(wrap.querySelector('.tick')!.textContent).toBe('0');
		expect(wrap.querySelector('.count')!.textContent).toBe('0');

		// Build child state.
		flushSync(() => bumpChild());
		flushSync(() => bumpChild());
		expect(r.container.querySelector('.count')!.textContent).toBe('2');

		// (2) re-render the PARENT — the children render-fn identity changes, but the
		// child must NOT re-mount: its state survives.
		flushSync(() => bumpParent());
		expect(r.container.querySelector('.tick')!.textContent).toBe('1');
		expect(r.container.querySelector('.count')!.textContent).toBe('2'); // preserved
		r.unmount();
	});
});
