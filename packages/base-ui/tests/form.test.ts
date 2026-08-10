import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { FormBasic } from './_fixtures/base-ui-diff.tsrx';

describe('@octanejs/base-ui — Form browser compatibility', () => {
	it('renders named fields without requiring Object.hasOwn', () => {
		const hasOwn = Object.hasOwn;
		let mounted: ReturnType<typeof mount> | undefined;

		try {
			// jsdom's own DOM bindings require Object.hasOwn, so restrict the missing
			// capability to the named application-field lookup being exercised.
			Object.hasOwn = (target: object, key: PropertyKey): boolean => {
				if (key === 'email' && Object.getPrototypeOf(target) === Object.prototype) {
					throw new TypeError('Object.hasOwn is unavailable');
				}
				return hasOwn(target, key);
			};
			mounted = mount(FormBasic);
		} finally {
			Object.hasOwn = hasOwn;
		}

		try {
			const input = mounted.container.querySelector('input')!;
			expect(input.getAttribute('name')).toBe('email');
			expect(mounted.container.querySelector('label')?.textContent).toBe('Email');
		} finally {
			mounted.unmount();
		}
	});
});
