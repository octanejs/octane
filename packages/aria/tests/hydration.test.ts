import { createElement as createReactElement, useState as useReactState } from 'react';
import { renderToString as renderReactToString } from 'react-dom/server';
import {
	I18nProvider as ReactI18nProvider,
	SSRProvider as ReactSSRProvider,
	useId as useReactAriaId,
	useIsSSR as useReactIsSSR,
	useLocale as useReactLocale,
} from 'react-aria';
import { flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../octane/tests/_helpers';
import { AriaServerFixture } from './ssr/_fixtures/server.tsx';

function ReactAriaServerContents() {
	const labelId = useReactAriaId('aria-hydration-label');
	const { locale, direction } = useReactLocale();
	const isSSR = useReactIsSSR();
	const [clicks] = useReactState(0);

	return createReactElement(
		'main',
		{ id: 'aria-server', 'data-locale': locale, 'data-direction': direction },
		createReactElement('label', { id: labelId, htmlFor: 'aria-hydration-input' }, 'Email'),
		createReactElement('input', {
			id: 'aria-hydration-input',
			'aria-labelledby': labelId,
		}),
		createReactElement('output', { id: 'aria-render-phase' }, isSSR ? 'server' : 'client'),
		createReactElement('button', { id: 'aria-hydration-button' }, 'Clicks: ' + clicks),
	);
}

async function settle(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

describe('@octanejs/aria hydration', () => {
	it('adopts labelled server nodes, preserves locale, and switches to the client snapshot', async () => {
		const container = document.createElement('div');
		container.innerHTML = renderReactToString(
			createReactElement(ReactSSRProvider, {
				children: createReactElement(ReactI18nProvider, {
					locale: 'ar-AE',
					children: createReactElement(ReactAriaServerContents),
				}),
			}),
		);
		document.body.appendChild(container);
		const serverMain = container.querySelector('#aria-server');
		const serverLabel = container.querySelector('#aria-hydration-label');
		const serverInput = container.querySelector('#aria-hydration-input');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			expect(container.querySelector('#aria-render-phase')?.textContent).toBe('server');

			root = hydrateRoot(container, AriaServerFixture, { locale: 'ar-AE' });
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
