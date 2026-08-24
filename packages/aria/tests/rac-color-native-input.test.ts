import { describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	ColorAreaNativeInputScenario,
	ColorWheelNativeInputScenario,
} from './_fixtures/rac-color-native-input.tsx';

// React divergence: React routes range edits through synthetic onChange. These cases pin
// Octane's equivalent native input contract and are not React-parity evidence.
describe('@octanejs/aria/components — color range inputs', () => {
	it('updates a ColorWheel immediately from its native input event', async () => {
		const r = mount(ColorWheelNativeInputScenario);
		const input = r.container.querySelector('input[type="range"]') as HTMLInputElement;
		const value = r.container.querySelector('[data-testid="wheel-value"]')!;

		expect(input.value).toBe('0');
		expect(value.textContent).toBe('unchanged');

		input.value = '120';
		await act(() => input.dispatchEvent(new Event('input', { bubbles: true })));

		expect(value.textContent).toBe('hsl(120, 100%, 50%)');
		r.unmount();
	});

	it('updates both ColorArea channels immediately from native input events', async () => {
		const r = mount(ColorAreaNativeInputScenario);
		const value = r.container.querySelector('[data-testid="area-value"]')!;
		let inputs = r.container.querySelectorAll<HTMLInputElement>('input[type="range"]');

		expect(inputs).toHaveLength(2);
		expect(value.textContent).toBe('unchanged');

		inputs[0].value = '25';
		await act(() => inputs[0].dispatchEvent(new Event('input', { bubbles: true })));
		expect(value.textContent).toBe('hsl(0, 25%, 50%)');

		inputs = r.container.querySelectorAll<HTMLInputElement>('input[type="range"]');
		inputs[1].value = '75';
		await act(() => inputs[1].dispatchEvent(new Event('input', { bubbles: true })));
		expect(value.textContent).toBe('hsl(0, 25%, 75%)');
		r.unmount();
	});
});
