import { describe, expect, it, vi } from 'vitest';
import { flushSync } from '../../octane/src/index.js';
import { mount } from '../../octane/tests/_helpers';
import { NumberFieldHiddenNativeCommit } from './_fixtures/base-ui-diff.tsrx';

describe('@octanejs/base-ui — NumberField native events', () => {
	it('the hidden form control accepts an explicit native change commit', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const m = mount(NumberFieldHiddenNativeCommit);
		try {
			const visible = m.find('.nf-input') as HTMLInputElement;
			const formControl = m.find('input[type="number"]') as HTMLInputElement;
			expect(visible.value).toBe('5');
			expect(formControl.value).toBe('5');
			expect(formControl.hasAttribute('suppressNativeChangeWarning')).toBe(false);
			expect(
				error.mock.calls.filter((call) =>
					String(call[0]).includes('[OCTANE_NATIVE_TEXT_ONCHANGE]'),
				),
			).toEqual([]);

			formControl.value = '8';
			flushSync(() => {
				formControl.dispatchEvent(new Event('change', { bubbles: true }));
			});

			expect(visible.value).toBe('8');
			expect(formControl.value).toBe('8');
		} finally {
			m.unmount();
			error.mockRestore();
		}
	});
});
