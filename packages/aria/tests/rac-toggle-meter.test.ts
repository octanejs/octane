import { beforeAll, describe, expect, it } from 'vitest';
import { act, mount, nextPaint } from '../../octane/tests/_helpers';
import {
	DisabledGroupScenario,
	MeterScenario,
	MultipleGroupScenario,
	SingleGroupScenario,
	ToggleScenario,
} from './_fixtures/rac-toggle-meter.tsx';

// @octanejs/aria Phase 4 — RAC ToggleButton / ToggleButtonGroup / Meter, driven
// through octane's NATIVE delegated events.

beforeAll(() => {
	// ToggleButtonGroup wraps its children in SharedElementTransition, whose
	// FLIP paths call element.getAnimations(); jsdom has no implementation.
	if (typeof (Element.prototype as any).getAnimations !== 'function') {
		(Element.prototype as any).getAnimations = () => [];
	}
});

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		width: 20,
		height: 20,
		pressure: 0.5,
		detail: 1,
		...init,
	});
}

async function press(el: Element) {
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
	});
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
	});
}

describe('@octanejs/aria/components — ToggleButton', () => {
	it('toggles aria-pressed/data-selected on press and exposes isSelected to the className render prop', async () => {
		const r = mount(ToggleScenario);
		const btn = r.container.querySelector('#standalone') as HTMLButtonElement;
		expect(btn.tagName).toBe('BUTTON');
		expect(btn.className).toBe('react-aria-ToggleButton');
		expect(btn.getAttribute('aria-pressed')).toBe('false');
		expect(btn.hasAttribute('data-selected')).toBe(false);

		await press(btn);
		expect(btn.getAttribute('aria-pressed')).toBe('true');
		expect(btn.getAttribute('data-selected')).toBe('true');
		expect(btn.className).toBe('react-aria-ToggleButton is-selected');
		expect(r.container.querySelector('[data-testid="toggle-last"]')!.textContent).toBe('last:true');

		await press(btn);
		expect(btn.getAttribute('aria-pressed')).toBe('false');
		expect(btn.hasAttribute('data-selected')).toBe(false);
		expect(btn.className).toBe('react-aria-ToggleButton');
		expect(r.container.querySelector('[data-testid="toggle-last"]')!.textContent).toBe(
			'last:false',
		);
		r.unmount();
	});

	it('reflects the transient pressed state in data-pressed and the render prop', async () => {
		const r = mount(ToggleScenario);
		const btn = r.container.querySelector('#standalone') as HTMLButtonElement;
		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
		});
		expect(btn.getAttribute('data-pressed')).toBe('true');
		expect(btn.className).toBe('react-aria-ToggleButton is-pressed');
		await act(() => {
			btn.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
			btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
		});
		expect(btn.hasAttribute('data-pressed')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria/components — ToggleButtonGroup', () => {
	it('single selection renders a radiogroup whose radio children swap selection', async () => {
		const r = mount(SingleGroupScenario);
		const group = r.container.querySelector('#single-group')!;
		expect(group.getAttribute('role')).toBe('radiogroup');
		expect(group.className).toBe('react-aria-ToggleButtonGroup');
		expect(group.getAttribute('data-orientation')).toBe('horizontal');

		const [left, center] = Array.from(group.querySelectorAll('button'));
		// Single-selection group items are radios (no aria-pressed).
		expect(left.getAttribute('role')).toBe('radio');
		expect(left.hasAttribute('aria-pressed')).toBe(false);
		// defaultSelectedKeys drives the initial selection through the group state.
		expect(left.getAttribute('aria-checked')).toBe('true');
		expect(left.getAttribute('data-selected')).toBe('true');
		expect(center.getAttribute('aria-checked')).toBe('false');
		expect(center.hasAttribute('data-selected')).toBe(false);

		await press(center);
		expect(center.getAttribute('aria-checked')).toBe('true');
		expect(center.getAttribute('data-selected')).toBe('true');
		expect(left.getAttribute('aria-checked')).toBe('false');
		expect(left.hasAttribute('data-selected')).toBe(false);
		r.unmount();
	});

	it('multiple selection keeps aria-pressed buttons and accumulates selected keys', async () => {
		const r = mount(MultipleGroupScenario);
		const group = r.container.querySelector('#multi-group')!;
		expect(group.getAttribute('role')).toBe('toolbar');

		const [bold, italic] = Array.from(group.querySelectorAll('button'));
		expect(bold.getAttribute('aria-pressed')).toBe('false');
		expect(bold.hasAttribute('role')).toBe(false);

		await press(bold);
		await press(italic);
		expect(bold.getAttribute('aria-pressed')).toBe('true');
		expect(bold.getAttribute('data-selected')).toBe('true');
		expect(italic.getAttribute('aria-pressed')).toBe('true');
		expect(r.container.querySelector('[data-testid="multi-keys"]')!.textContent).toBe(
			'keys:bold,italic',
		);

		await press(bold);
		expect(bold.getAttribute('aria-pressed')).toBe('false');
		expect(bold.hasAttribute('data-selected')).toBe(false);
		expect(italic.getAttribute('aria-pressed')).toBe('true');
		expect(r.container.querySelector('[data-testid="multi-keys"]')!.textContent).toBe(
			'keys:italic',
		);
		r.unmount();
	});

	it('a disabled group disables its items through the shared state', async () => {
		const r = mount(DisabledGroupScenario);
		const group = r.container.querySelector('#disabled-group')!;
		expect(group.getAttribute('aria-disabled')).toBe('true');
		expect(group.getAttribute('data-disabled')).toBe('true');

		const btn = group.querySelector('button') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
		expect(btn.getAttribute('data-disabled')).toBe('true');
		await press(btn);
		expect(btn.hasAttribute('data-selected')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria/components — Meter', () => {
	it('exposes the meter role, ARIA value attributes, and the percentage render prop', () => {
		const r = mount(MeterScenario);
		const meter = r.container.querySelector('#mt')!;
		// Meter uses the meter role with a progressbar fallback for older browsers.
		expect(meter.getAttribute('role')).toBe('meter progressbar');
		expect(meter.className).toBe('react-aria-Meter');
		expect(meter.getAttribute('aria-valuenow')).toBe('30');
		expect(meter.getAttribute('aria-valuemin')).toBe('0');
		expect(meter.getAttribute('aria-valuemax')).toBe('100');
		const valueText = meter.getAttribute('aria-valuetext')!;
		expect(meter.textContent).toBe('pct:30|' + valueText);

		// Values clamp to [minValue, maxValue] before the percentage is computed.
		const clamped = r.container.querySelector('#mt-clamped')!;
		expect(clamped.getAttribute('aria-valuenow')).toBe('200');
		expect(clamped.textContent).toBe('pct:100');
		r.unmount();
	});

	it('a slotted Label child renders as a span and provides the accessible name', async () => {
		const r = mount(MeterScenario);
		await nextPaint();
		const meter = r.container.querySelector('#mt-labeled')!;
		const label = meter.querySelector('.react-aria-Label')!;
		expect(label.tagName).toBe('SPAN');
		expect(label.textContent).toBe('Battery');
		expect(meter.getAttribute('aria-labelledby')).toBe(label.id);
		r.unmount();
	});
});
