import {
	createElement as createReactElement,
	useState as useReactState,
	useSyncExternalStore as useReactSyncExternalStore,
} from 'react';
import { renderToString as renderReactToString } from 'react-dom/server';
import { Separator as ReactSeparator } from '@base-ui/react/separator';
import { flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../octane/tests/_helpers';
import { BaseHydrationFixture } from './ssr/_fixtures/server.tsx';

function subscribe(): () => void {
	return () => {};
}

function ReactBaseHydrationFixture() {
	const isHydrating = useReactSyncExternalStore(
		subscribe,
		() => false,
		() => true,
	);
	const [clicks] = useReactState(0);

	return createReactElement(
		'main',
		{ id: 'base-ui-server' },
		createReactElement('output', { id: 'base-ui-render-phase' }, isHydrating ? 'server' : 'client'),
		createReactElement(ReactSeparator, {
			id: 'base-ui-server-separator',
			orientation: 'vertical',
		}),
		createReactElement('button', { id: 'base-ui-hydration-button' }, 'Clicks: ' + clicks),
	);
}

async function settle(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

describe('@octanejs/base-ui hydration', () => {
	it('adopts the upstream server markup and flips the hydration snapshot after commit', async () => {
		const container = document.createElement('div');
		container.innerHTML = renderReactToString(createReactElement(ReactBaseHydrationFixture));
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
