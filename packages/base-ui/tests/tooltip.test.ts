import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { TooltipInteractive } from './_fixtures/base-ui-diff.tsrx';

// A tooltip is hover- and focus-driven, and neither the timing nor the focus path is visible in a
// single innerHTML snapshot, so these cover what the differential rig cannot: hovering the trigger
// mounts the popup, leaving unmounts it, and focusing the trigger opens it too.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

function trigger(m: { container: Element }): Element {
	const el = m.container.querySelector('.tip-trigger');
	if (!el) throw new Error('no tooltip trigger in the tree');
	return el;
}

function dispatch(el: Element, type: string, init: MouseEventInit | FocusEventInit = {}): void {
	flushSync(() => {
		const event =
			type === 'focus' || type === 'blur'
				? new FocusEvent(type, { bubbles: false, ...init })
				: new MouseEvent(type, { bubbles: false, cancelable: true, ...init });
		el.dispatchEvent(event);
	});
}

describe('@octanejs/base-ui — Tooltip behavior', () => {
	it('hovering the trigger opens the tooltip and leaving closes it', async () => {
		const m = mount(TooltipInteractive);
		await settle();

		expect(m.container.querySelector('.tip-popup')).toBe(null);

		dispatch(trigger(m), 'mouseenter');
		await settle();
		expect(m.container.querySelector('.tip-popup')).not.toBe(null);

		dispatch(trigger(m), 'mouseleave');
		await settle();
		expect(m.container.querySelector('.tip-popup')).toBe(null);

		m.unmount();
	});

	it('focusing the trigger opens the tooltip', async () => {
		const m = mount(TooltipInteractive);
		await settle();

		dispatch(trigger(m), 'focus');
		await settle();
		expect(m.container.querySelector('.tip-popup')).not.toBe(null);

		m.unmount();
	});
});
