import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { PreviewCardInteractive } from './_fixtures/base-ui-diff.tsrx';

// A preview card opens on hover of an inline link and closes when the cursor leaves, neither of
// which is visible in a single innerHTML snapshot. These cover what the differential rig cannot.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

function trigger(m: { container: Element }): Element {
	const el = m.container.querySelector('.pc-trigger');
	if (!el) throw new Error('no preview-card trigger in the tree');
	return el;
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

describe('@octanejs/base-ui — PreviewCard behavior', () => {
	it('hovering the link opens the card and leaving closes it', async () => {
		const m = mount(PreviewCardInteractive);
		await settle();

		expect(m.container.querySelector('.pc-popup')).toBe(null);

		hover(trigger(m), 'mouseenter');
		await settle();
		expect(m.container.querySelector('.pc-popup')).not.toBe(null);

		hover(trigger(m), 'mouseleave');
		await settle();
		expect(m.container.querySelector('.pc-popup')).toBe(null);

		m.unmount();
	});

	it('the card stays open while the cursor moves into it', async () => {
		const m = mount(PreviewCardInteractive);
		await settle();

		hover(trigger(m), 'mouseenter');
		await settle();

		const popup = m.container.querySelector('.pc-popup')!;
		expect(popup).not.toBe(null);

		hover(trigger(m), 'mouseleave', popup);
		hover(popup, 'mouseenter');
		await settle();
		expect(m.container.querySelector('.pc-popup')).not.toBe(null);

		m.unmount();
	});
});
