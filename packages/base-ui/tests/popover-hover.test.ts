import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { PopoverHover, PopoverHoverCloseDelay } from './_fixtures/base-ui-diff.tsrx';

// Behavior tests for `openOnHover`. Hover open/close is pointer- and timer-driven, so none of it is
// visible in a single innerHTML snapshot — the differential rig cannot observe it. These assert the
// consumer-visible contract: hovering the trigger mounts the popup, leaving it unmounts the popup,
// and a `closeDelay` keeps the popup mounted until the delay elapses.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

function hover(el: Element, type: 'mouseenter' | 'mouseleave', relatedTarget?: Element): void {
	flushSync(() => {
		el.dispatchEvent(
			new MouseEvent(type, {
				bubbles: false,
				cancelable: true,
				relatedTarget: relatedTarget ?? null,
			}),
		);
	});
}

// Opening wraps the trigger in focus guards, which remounts the button — so the trigger must be
// re-queried after any open before dispatching the matching `mouseleave`.
function trigger(m: { container: Element }): Element {
	const el = m.container.querySelector('.pop-trigger');
	if (!el) throw new Error('no popover trigger in the tree');
	return el;
}

describe('@octanejs/base-ui — Popover open-on-hover', () => {
	it('hovering the trigger opens the popover and leaving it closes again', async () => {
		const m = mount(PopoverHover);
		await settle();

		expect(m.container.querySelector('[role="dialog"]')).toBe(null);

		hover(trigger(m), 'mouseenter');
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).not.toBe(null);

		hover(trigger(m), 'mouseleave');
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).toBe(null);

		m.unmount();
	});

	it('a hover-opened popover stays open while the cursor moves into the popup', async () => {
		const m = mount(PopoverHover);
		await settle();

		hover(trigger(m), 'mouseenter');
		await settle();

		const popup = m.container.querySelector('[role="dialog"]')!;
		expect(popup).not.toBe(null);

		// Leaving the trigger *toward the popup*, then entering the popup, must not close it —
		// this is the keep-open path owned by the floating-side hover interaction.
		hover(trigger(m), 'mouseleave', popup);
		hover(popup, 'mouseenter');
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).not.toBe(null);

		m.unmount();
	});

	it('closeDelay keeps the popover open until the delay elapses', async () => {
		const m = mount(PopoverHoverCloseDelay);
		await settle();

		hover(trigger(m), 'mouseenter');
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).not.toBe(null);

		hover(trigger(m), 'mouseleave');
		await settle();
		// Still mounted: the 200ms close delay has not elapsed.
		expect(m.container.querySelector('[role="dialog"]')).not.toBe(null);

		await new Promise((res) => setTimeout(res, 250));
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).toBe(null);

		m.unmount();
	});
});
