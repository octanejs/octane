import { flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../octane/tests/_helpers';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { BaseHydrationFixture } from './ssr/_fixtures/server.tsx';

async function settle(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

describe('@octanejs/base-ui hydration', () => {
	it('adopts Octane server markup and flips the hydration snapshot after commit', async () => {
		const serverResult = await renderHydrationFixture(
			'base-ui',
			'packages/base-ui/tests/ssr/_fixtures/server.tsx',
			'BaseHydrationFixture',
		);
		const container = document.createElement('div');
		container.innerHTML = serverResult.html;
		document.body.appendChild(container);
		const serverMain = container.querySelector('#base-ui-server');
		const serverSeparator = container.querySelector('#base-ui-server-separator');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			expect(container.querySelector('#base-ui-render-phase')?.textContent).toBe('server');

			root = hydrateRoot(container, BaseHydrationFixture);
			await settle();

			expect(container.querySelector('#base-ui-server')).toBe(serverMain);
			expect(container.querySelector('#base-ui-server-separator')).toBe(serverSeparator);
			expect(serverSeparator?.getAttribute('aria-orientation')).toBe('vertical');
			expect(container.querySelector('#base-ui-render-phase')?.textContent).toBe('client');
			expect(errors).not.toHaveBeenCalled();

			container.querySelector<HTMLButtonElement>('#base-ui-hydration-button')?.click();
			flushSync(() => {});

			expect(container.querySelector('#base-ui-hydration-button')?.textContent).toBe('Clicks: 1');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	});
});
