import { describe, it, expect } from 'vitest';
import { act, mount } from './_helpers';
import {
	ActivationCommitCheckbox,
	ActivationCommitRadioGroup,
	ActivationCommitRejectedCheckbox,
	NestedCanceledActivation,
} from './_fixtures/checkable-activation.tsx';

// A click on a checkable toggles the DOM BEFORE the click dispatch, and the native
// `input`/`change` events fire AFTER it. A handler that forces a synchronous commit
// during the click (flushSync — press-state machinery does this) must not have the
// controlled `checked` reassert revert the in-flight toggle: React's update path
// diffs prev props (not the DOM), leaving the drift for the event-side restore.
describe('controlled checkable with a mid-activation commit', () => {
	it('a flushSync commit inside onClick does not revert the toggle before onInput', async () => {
		const r = mount(ActivationCommitCheckbox);
		const cb = r.container.querySelector('input')!;
		await act(() => {
			cb.click();
		});
		expect(cb.getAttribute('data-pressed')).toBe('true'); // the mid-click commit happened
		expect(cb.checked).toBe(true); // and the user's toggle survived it
		r.unmount();
	});

	it('a mid-click commit does not reassert a radio-group cousin over the toggle', async () => {
		const r = mount(ActivationCommitRadioGroup);
		const b = r.container.querySelector<HTMLInputElement>('[data-value="b"]')!;
		const a = r.container.querySelector<HTMLInputElement>('[data-value="a"]')!;
		const wrap = r.container.querySelector('div')!;
		await act(() => {
			b.click();
		});
		expect(wrap.getAttribute('data-pressed')).toBe('true'); // the mid-click commit happened
		// The platform unchecked `a` as part of checking `b`; re-checking `a` in the
		// mid-click commit would have made the browser uncheck `b` again, so the
		// input handler would see e.target.checked === false and never commit.
		expect(wrap.getAttribute('data-seen')).toBe('b:true');
		expect(b.checked).toBe(true);
		expect(a.checked).toBe(false);
		r.unmount();
	});

	it('a rejected toggle (no onInput) still snaps back to the controlled prop', async () => {
		const r = mount(ActivationCommitRejectedCheckbox);
		const cb = r.container.querySelector('input')!;
		await act(() => {
			cb.click();
		});
		expect(cb.getAttribute('data-pressed')).toBe('true');
		expect(cb.checked).toBe(false); // restore reverted the unheard edit
		r.unmount();
	});

	it('a canceled nested activation does not suppress a later controlled restore', async () => {
		const r = mount(NestedCanceledActivation, { version: 0 });
		const wrap = r.container.querySelector('div')!;
		const cb = r.container.querySelector('input')!;

		await act(() => {
			wrap.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
		});
		expect(cb.checked).toBe(false);

		cb.checked = true;
		r.update(NestedCanceledActivation, { version: 1 });
		expect(cb.checked).toBe(false);
		r.unmount();
	});
});
