import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { UncontrolledCounter, ControlledFrozen, ControlledCounter } from './_fixtures/stately.tsx';

// @octanejs/aria/stately — useControlledState.

describe('@octanejs/aria/stately — useControlledState', () => {
	it('uncontrolled: defaultValue seeds the state and the setter updates the render', async () => {
		const r = mount(UncontrolledCounter);
		const out = r.container.querySelector('output')!;
		expect(out.textContent).toBe('v:5');
		await act(() => {
			r.container.querySelector<HTMLButtonElement>('[data-testid="set"]')!.click();
		});
		expect(out.textContent).toBe('v:6');
		r.unmount();
	});

	it('uncontrolled: the functional updater form receives the previous value', async () => {
		const r = mount(UncontrolledCounter);
		const out = r.container.querySelector('output')!;
		await act(() => {
			r.container.querySelector<HTMLButtonElement>('[data-testid="fn"]')!.click();
		});
		expect(out.textContent).toBe('v:15');
		// A second functional update sees the value the first one produced.
		await act(() => {
			r.container.querySelector<HTMLButtonElement>('[data-testid="fn"]')!.click();
		});
		expect(out.textContent).toBe('v:25');
		r.unmount();
	});

	it('controlled: the controlled value wins and onChange fires with the new value', async () => {
		const r = mount(ControlledFrozen);
		const value = r.container.querySelector('[data-testid="value"]')!;
		const log = r.container.querySelector('[data-testid="log"]')!;
		expect(value.textContent).toBe('s:42'); // controlled value, not defaultValue
		expect(log.textContent).toBe('log:none');
		await act(() => {
			r.container.querySelector('button')!.click();
		});
		// The parent never moves `value`, so the rendered state stays controlled at 42 —
		// but onChange observed the requested value.
		expect(value.textContent).toBe('s:42');
		expect(log.textContent).toBe('log:100');
		r.unmount();
	});

	it('controlled: a parent wiring onChange back into value drives the render', async () => {
		const r = mount(ControlledCounter);
		const out = r.container.querySelector('output')!;
		expect(out.textContent).toBe('s:10');
		await act(() => {
			r.container.querySelector('button')!.click();
		});
		expect(out.textContent).toBe('s:11');
		// The functional updater keeps receiving the latest controlled value.
		await act(() => {
			r.container.querySelector('button')!.click();
		});
		expect(out.textContent).toBe('s:12');
		r.unmount();
	});
});
