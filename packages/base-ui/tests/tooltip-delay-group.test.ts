import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { TooltipsWithoutProvider } from './_fixtures/base-ui-diff.tsrx';

// Base UI's delay-group context has a MODULE-LEVEL default whose refs every tooltip shares when
// no `Tooltip.Provider` is present, and `useDelayGroup`'s effects do not gate on `hasProvider` —
// they only consult it for delay math. Unscoped tooltips therefore still coordinate: opening one
// closes the one already open.
//
// This is upstream behavior, transcribed rather than chosen, so it is pinned here on purpose. A
// change that decouples unscoped tooltips would be a deliberate divergence from `@base-ui/react`
// and should be recorded as one rather than landing silently.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

function hover(m: { container: Element }, selector: string): void {
	const el = m.container.querySelector(selector);
	if (!el) throw new Error(`no element matching ${selector}`);
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: true }));
	});
}

describe('@octanejs/base-ui — Tooltip delay grouping', () => {
	it('closes an open tooltip when another opens, even with no Provider around them', async () => {
		const m = mount(TooltipsWithoutProvider);
		await settle();

		hover(m, '.tip-a');
		await settle();
		expect(m.container.querySelector('.pop-a')).not.toBe(null);
		expect(m.container.querySelector('.pop-b')).toBe(null);

		// B is hovered without A ever being left, so A closing is the shared delay group at work,
		// not ordinary hover-out.
		hover(m, '.tip-b');
		await settle();
		expect(m.container.querySelector('.pop-a')).toBe(null);
		expect(m.container.querySelector('.pop-b')).not.toBe(null);

		m.unmount();
	});
});
