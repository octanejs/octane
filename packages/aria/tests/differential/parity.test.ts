/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/aria (octane) AND
 * the real react-aria (React) — the setup rewrites `@octanejs/aria` → `react-aria` and
 * `octane` → `react` for the React side. octane's `mountDifferential` mounts both, drives
 * identical events, and asserts byte-identical innerHTML after each step. This is the
 * gold-standard proof that the ported interactions behave like React Aria on React.
 *
 * Both sides share one jsdom document, and an active press attaches document-level
 * global listeners — usePress filters them by `pointerId`, so each side gets a DISTINCT
 * pointerId (octane 1, react 2) to keep the gestures isolated.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

function pointerInit(pointerId: number, overrides: PointerEventInit = {}): PointerEventInit {
	// Non-default width/height/pressure/detail so isVirtualPointerEvent (VoiceOver
	// detection) doesn't classify the gesture as a virtual press.
	return {
		bubbles: true,
		cancelable: true,
		composed: true,
		pointerId,
		pointerType: 'mouse',
		width: 10,
		height: 10,
		pressure: 0.5,
		detail: 1,
		...overrides,
	};
}

describe('differential: @octanejs/aria vs real react-aria on React', () => {
	it('usePress: pointer press start → pressed state → press sequence, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'PressLog', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('pointerdown', (i, r) => {
			i.find('#press').dispatchEvent(new PointerEvent('pointerdown', pointerInit(1)));
			r.find('#press').dispatchEvent(new PointerEvent('pointerdown', pointerInit(2)));
		});
		await d.step('pointerup + click', (i, r) => {
			const iEl = i.find('#press');
			iEl.dispatchEvent(new PointerEvent('pointerup', pointerInit(1)));
			iEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
			const rEl = r.find('#press');
			rEl.dispatchEvent(new PointerEvent('pointerup', pointerInit(2)));
			rEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
		});
		d.unmount();
	});

	it('useHover: pointer enter/leave toggles hover state, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'HoverBadge', undefined, CACHE);
		await d.step('mount', () => {});
		// One user gesture arrives differently per renderer: the browser fires BOTH the
		// bubbling over/out pair (React synthesizes enter/leave from those) and the
		// non-bubbling enter/leave pair (octane delegates those directly). Dispatch each
		// side's own form. Order matters because a hovered useHover attaches a
		// DOCUMENT-capture 'pointerover' listener that ends the hover when a pointerover
		// lands outside its target (removed-element cleanup — upstream behavior): the
		// react side's bubbling pointerover must fire BEFORE octane's hover starts, and
		// octane's non-bubbling events are invisible to that document listener.
		await d.step('hover on', (i, r) => {
			r.find('#hover').dispatchEvent(
				new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
			);
			i.find('#hover').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		});
		await d.step('hover off', (i, r) => {
			i.find('#hover').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
			r.find('#hover').dispatchEvent(
				new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }),
			);
		});
		d.unmount();
	});

	it('useFocusWithin: focus inside sets, focus outside clears, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'FocusWithinBox', undefined, CACHE);
		await d.step('mount', () => {});
		// Real `.focus()` would fight over the ONE document's focus across the two live
		// copies (focusing the react input blurs the octane one). Dispatch the focus
		// event pair synthetically instead — octane delegates capture-phase 'focus'
		// with an ancestor walk; React listens to bubbling 'focusin' — no real focus
		// moves, both sides observe an identical gesture.
		await d.step('focus inside', (i, r) => {
			for (const side of [i, r]) {
				const el = side.find('#fw-input');
				el.dispatchEvent(new FocusEvent('focus'));
				el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
			}
		});
		await d.step('focus outside', (i, r) => {
			for (const side of [i, r]) {
				const inside = side.find('#fw-input');
				const outside = side.find('#fw-outside');
				inside.dispatchEvent(new FocusEvent('blur', { relatedTarget: outside }));
				inside.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
			}
		});
		d.unmount();
	});

	it('useKeyboard: stop-by-default suppresses the parent; continuePropagation lets it through', async () => {
		const d = await mountDifferential(FIXTURE, 'KeyEcho', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('keydown on stopping child', async (i, r) => {
			await i.keydown('#key-stop', 'a');
			await r.keydown('#key-stop', 'a');
		});
		await d.step('keydown on propagating child', async (i, r) => {
			await i.keydown('#key-pass', 'b');
			await r.keydown('#key-pass', 'b');
		});
		d.unmount();
	});

	it('useKeyboard: continuePropagation latch across dispatches of one wrapper matches React', async () => {
		const d = await mountDifferential(FIXTURE, 'KeyLatch', undefined, CACHE);
		await d.step('mount', () => {});
		// Two keydowns with NO re-render in between (handlers only log to module state),
		// so the SAME wrapper instance handles both — pinning upstream's cross-dispatch
		// flag semantics after continuePropagation(). The flush click then renders the
		// per-side log for the byte comparison.
		await d.step('c then x, flush', async (i, r) => {
			await i.keydown('#latch-input', 'c');
			await r.keydown('#latch-input', 'c');
			await i.keydown('#latch-input', 'x');
			await r.keydown('#latch-input', 'x');
			await i.click('#latch-flush');
			await r.click('#latch-flush');
		});
		d.unmount();
	});

	it('useId + mergeProps: merged ids converge with consistent references', async () => {
		const d = await mountDifferential(FIXTURE, 'MergedIdsLabel', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
});
