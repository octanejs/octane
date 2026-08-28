// @vitest-environment happy-dom

import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { SelectFixture, type SelectOption } from './select-fixture.tsrx';

describe('@octanejs/select hydration', () => {
	it('hydrates Apple clients from platform-neutral server markup before updating ARIA', async () => {
		const options: readonly SelectOption[] = [
			{ label: 'One', value: '1' },
			{ label: 'Two', value: '2' },
		];
		const props = {
			hideSelectedOptions: false,
			instanceId: 'apple-hydration',
			menuIsOpen: true,
			onChange() {},
			onInputChange: (value: string) => value,
			onMenuClose() {},
			onMenuOpen() {},
			options,
			value: options[0],
		};
		const server = await renderHydrationFixture(
			'select',
			'packages/select/tests/select-fixture.tsrx',
			'SelectFixture',
			props,
		);
		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);
		const serverInput = container.querySelector('[role="combobox"]');
		const serverOption = container.querySelector('[role="option"]');
		const platform = Object.getOwnPropertyDescriptor(window.navigator, 'platform');
		const maxTouchPoints = Object.getOwnPropertyDescriptor(window.navigator, 'maxTouchPoints');
		Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'MacIntel' });
		Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: 0 });
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			expect(serverInput?.hasAttribute('aria-activedescendant')).toBe(true);
			expect(serverOption?.getAttribute('aria-selected')).toBe('true');

			root = hydrateRoot(container, SelectFixture, props as never);
			flushSync(() => {});

			expect(container.querySelector('[role="combobox"]')).toBe(serverInput);
			expect(container.querySelector('[role="option"]')).toBe(serverOption);
			expect(serverInput?.hasAttribute('aria-activedescendant')).toBe(true);
			expect(serverOption?.getAttribute('aria-selected')).toBe('true');
			expect(errors).not.toHaveBeenCalled();

			drainPassiveEffects();
			flushSync(() => {});
			expect(serverInput?.hasAttribute('aria-activedescendant')).toBe(false);
			expect(serverOption?.hasAttribute('aria-selected')).toBe(false);
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			if (platform) Object.defineProperty(window.navigator, 'platform', platform);
			else Reflect.deleteProperty(window.navigator, 'platform');
			if (maxTouchPoints) {
				Object.defineProperty(window.navigator, 'maxTouchPoints', maxTouchPoints);
			} else Reflect.deleteProperty(window.navigator, 'maxTouchPoints');
			container.remove();
		}
	}, 15_000);
});
