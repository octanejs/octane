/**
 * Phase-4 differential parity: the SAME react-aria-components `.tsrx` fixtures run
 * through @octanejs/aria/components (octane) and the REAL react-aria-components 1.19.0
 * (React), driving identical interactions and asserting byte-identical innerHTML per
 * step. RAC's data-* state attributes (data-hovered/pressed/selected/expanded) plus
 * render-prop classNames make interaction state visible to the HTML compare — the
 * migration plan's Phase-4 exit criterion.
 *
 * Rig gotchas honored (see the aria memory + parity.test.ts): the two live copies
 * share ONE document, so press gestures use DISTINCT pointerIds per side (octane 1,
 * react 2), and hover dispatches each renderer's own delivery form (react bubbling
 * pointerover FIRST, then octane non-bubbling pointerenter).
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-rac.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

// jsdom lacks CSS.escape and getAnimations (used by selection delegates and the
// RAC animation helpers on both sides).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}
if (typeof (Element.prototype as any).getAnimations !== 'function') {
	(Element.prototype as any).getAnimations = () => [];
}

function pointerInit(pointerId: number, overrides: PointerEventInit = {}): PointerEventInit {
	// Non-default width/height/pressure so isVirtualPointerEvent doesn't classify the
	// gesture as a virtual (screen-reader) press.
	return {
		bubbles: true,
		cancelable: true,
		pointerId,
		pointerType: 'mouse',
		width: 1,
		height: 1,
		pressure: 0.5,
		...overrides,
	};
}

describe('differential: @octanejs/aria/components Phase-4 vs real react-aria-components', () => {
	it('Button: hover + mid-press data attributes + press count, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ButtonSpec', undefined, CACHE);
		await d.step('mount', () => {});
		// Hover: react side's bubbling pointerover must fire BEFORE octane's hover
		// starts (a hovered useHover attaches a document-capture pointerover listener
		// that ends hover on outside pointerovers).
		await d.step('hover on', (i, r) => {
			r.find('#btn').dispatchEvent(
				new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
			);
			i.find('#btn').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		});
		await d.step('pointerdown (pressed state visible)', (i, r) => {
			i.find('#btn').dispatchEvent(new PointerEvent('pointerdown', pointerInit(1)));
			r.find('#btn').dispatchEvent(new PointerEvent('pointerdown', pointerInit(2)));
		});
		await d.step('pointerup + click (press committed)', (i, r) => {
			const iEl = i.find('#btn');
			iEl.dispatchEvent(new PointerEvent('pointerup', pointerInit(1)));
			iEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
			const rEl = r.find('#btn');
			rEl.dispatchEvent(new PointerEvent('pointerup', pointerInit(2)));
			rEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
		});
		d.unmount();
	});

	it('ToggleButton: click toggles aria-pressed + data-selected, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleButtonSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('toggle on', async (i, r) => {
			await i.click('#toggle');
			await r.click('#toggle');
		});
		await d.step('toggle off', async (i, r) => {
			await i.click('#toggle');
			await r.click('#toggle');
		});
		d.unmount();
	});

	it('Checkbox: click toggles data-selected + render-prop className, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'CheckboxSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('check', async (i, r) => {
			await i.click('input');
			await r.click('input');
		});
		await d.step('uncheck', async (i, r) => {
			await i.click('input');
			await r.click('input');
		});
		d.unmount();
	});

	it('TextField: typing through the native input path, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TextFieldSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('type', async (i, r) => {
			await i.input('#name-input', 'ada');
			await r.input('#name-input', 'ada');
		});
		d.unmount();
	});

	it('Disclosure: trigger press expands the panel with data-expanded, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'DisclosureSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('expand', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		await d.step('collapse', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		d.unmount();
	});
});
