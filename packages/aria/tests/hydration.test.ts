import { flushSync, hydrateRoot } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../octane/tests/_helpers';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { AriaHydrationFixture } from './hydration/_fixtures/server';

async function settle(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

let serverResult: Awaited<ReturnType<typeof renderHydrationFixture>>;

beforeAll(async () => {
	serverResult = await renderHydrationFixture(
		'aria',
		'packages/aria/tests/hydration/_fixtures/server.tsx',
		'AriaHydrationFixture',
		{ locale: 'ar-AE' },
	);
});

describe('@octanejs/aria hydration', () => {
	it('adopts labelled Octane server nodes, preserves locale, and switches snapshots', async () => {
		const container = document.createElement('div');
		container.innerHTML = serverResult.html;
		document.body.appendChild(container);
		const serverMain = container.querySelector('#aria-server');
		const serverLabel = container.querySelector('#aria-hydration-label');
		const serverInput = container.querySelector('#aria-hydration-input');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			expect(container.querySelector('#aria-render-phase')?.textContent).toBe('server');

			root = hydrateRoot(container, AriaHydrationFixture, { locale: 'ar-AE' });
			await settle();

			expect(container.querySelector('#aria-server')).toBe(serverMain);
			expect(container.querySelector('#aria-hydration-label')).toBe(serverLabel);
			expect(container.querySelector('#aria-hydration-input')).toBe(serverInput);
			expect(serverInput?.getAttribute('aria-labelledby')).toBe(serverLabel?.id);
			expect(serverMain?.getAttribute('data-locale')).toBe('ar-AE');
			expect(serverMain?.getAttribute('data-direction')).toBe('rtl');
			expect(container.querySelector('#aria-render-phase')?.textContent).toBe('client');
			expect(errors).not.toHaveBeenCalled();

			container.querySelector<HTMLButtonElement>('#aria-hydration-button')?.click();
			flushSync(() => {});

			expect(container.querySelector('#aria-hydration-button')?.textContent).toBe('Clicks: 1');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	});
});
