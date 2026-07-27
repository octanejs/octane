import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { ContextMenuInteractive } from './_fixtures/base-ui-diff.tsrx';

// Behavior tests for ContextMenu — Phase 3f stage 4. The rig proves the open menu's DOM; what it
// cannot see is the gesture that opens it, the cursor-anchored positioning, or the suppression of
// the browser's native context menu.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

function rightClick(target: Element, x = 120, y = 80): MouseEvent {
	const event = new MouseEvent('contextmenu', {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		button: 2,
	});
	flushSync(() => {
		target.dispatchEvent(event);
	});
	return event;
}

describe('@octanejs/base-ui — ContextMenu behavior', () => {
	it('opens on a contextmenu gesture and closes on Escape', async () => {
		const m = mount(ContextMenuInteractive);
		await settle();

		expect(m.container.querySelector('[role="menu"]')).toBe(null);

		rightClick(m.find('.ctx-trigger'));
		await settle();

		const popup = m.container.querySelector('.ctx-popup');
		expect(popup).not.toBe(null);
		expect(popup!.getAttribute('role')).toBe('menu');
		expect(m.find('.ctx-trigger').hasAttribute('data-popup-open')).toBe(true);

		flushSync(() => {
			popup!.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		await settle();

		expect(m.container.querySelector('.ctx-popup')).toBe(null);

		m.unmount();
	});

	it('suppresses the browser context menu over the trigger', async () => {
		const m = mount(ContextMenuInteractive);
		await settle();

		// The trigger's own handler calls `stopEvent`, and a document-level listener additionally
		// preventDefaults any contextmenu landing on the trigger or either backdrop — otherwise the
		// native menu would appear on top of the popup.
		const event = rightClick(m.find('.ctx-trigger'));
		await settle();
		expect(event.defaultPrevented).toBe(true);

		m.unmount();
	});

	it('anchors the positioner at the cursor rather than at the trigger', async () => {
		const m = mount(ContextMenuInteractive);
		await settle();

		rightClick(m.find('.ctx-trigger'), 120, 80);
		await settle();

		// The `context-menu` parent branch switches the positioner to FIXED positioning (a dropdown
		// menu is absolute), because it is anchored to a point in the viewport, not to an element.
		const positioner = m.find('.ctx-positioner') as HTMLElement;
		expect(positioner.style.position).toBe('fixed');
		// The anchor is a synthetic zero-size rect at the cursor, held on `ContextMenu.Root` and
		// repointed by the trigger on every gesture, so the computed origin tracks the pointer.
		expect(positioner.style.getPropertyValue('--transform-origin')).toBe('1px 74px');

		m.unmount();

		// Right-clicking elsewhere yields a different origin. NOT asserted: `transform` and
		// `data-align`, which collision avoidance clamps to the same value for every point because
		// jsdom reports a zero-size viewport.
		const m2 = mount(ContextMenuInteractive);
		await settle();
		rightClick(m2.find('.ctx-trigger'), 400, 300);
		await settle();
		expect(
			(m2.find('.ctx-positioner') as HTMLElement).style.getPropertyValue('--transform-origin'),
		).toBe('1px 294px');

		m2.unmount();
	});
});
