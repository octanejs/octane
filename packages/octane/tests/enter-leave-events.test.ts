import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { flushSync } from '../src/index.js';
import { EnterLeaveEvents } from './_fixtures/enter-leave-events.tsrx';

// Regression: enter/leave events don't bubble, so bubble-phase root delegation never
// saw them — onPointerEnter/onPointerLeave/onMouseEnter/onMouseLeave silently never
// fired. They are now capture-delegated (like focus/blur) but dispatched to the
// TARGET ONLY: the browser sends each entered/left element its own event, so an
// ancestor walk would double-fire ancestors (which receive their own events).
describe('enter/leave delegation (capture phase, target only)', () => {
	it('fires onPointerEnter/Leave + onMouseEnter on their element', () => {
		const r = mount(EnterLeaveEvents);
		const btn = r.container.querySelector('.btn') as HTMLElement;
		const log = () => r.container.querySelector('.log')!.textContent;

		flushSync(() => {
			btn.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
		});
		expect(log()).toBe('e');
		flushSync(() => {
			btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
		});
		expect(log()).toBe('em');
		flushSync(() => {
			btn.dispatchEvent(new MouseEvent('pointerleave', { bubbles: false }));
		});
		expect(log()).toBe('eml');
		r.unmount();
	});

	it('does NOT fire an ancestor handler for a descendant-targeted event', () => {
		const r = mount(EnterLeaveEvents);
		const wrap = r.container.querySelector('.wrap') as HTMLElement;
		const btn = r.container.querySelector('.btn') as HTMLElement;
		const log = () => r.container.querySelector('.log')!.textContent;

		// The button's event fires the button's handler only — the wrapper receives
		// its OWN pointerenter from the browser (simulated next), never the child's.
		flushSync(() => {
			btn.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
		});
		expect(log()).toBe('e');
		flushSync(() => {
			wrap.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
		});
		expect(log()).toBe('eW');
		r.unmount();
	});
});
