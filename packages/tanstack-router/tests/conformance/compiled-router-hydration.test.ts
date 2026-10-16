import { describe, expect, it } from 'vitest';
import { hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import {
	CompiledRouterProvider,
	PreconfiguredRouterProvider,
} from '@octanejs/tanstack-router/compiled';
import { nextPaint } from '../_helpers';
import { makeCompiledRouter } from '../_fixtures/compiled-router.tsrx';
// @ts-expect-error the shared fixture plugin compiles the router graph for the server
import * as server from '../_fixtures/compiled-router.tsrx?octane-ssr';

async function settle() {
	for (let i = 0; i < 6; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}

describe.each([
	{
		label: 'option-capable',
		client: CompiledRouterProvider,
		server: server.CompiledRouterProvider,
	},
	{
		label: 'preconfigured',
		client: PreconfiguredRouterProvider,
		server: server.PreconfiguredRouterProvider,
	},
])('compiled routes across SSR and hydration ($label)', ({ client, server: provider }) => {
	it('adopts the loaded lazy route and navigates with live hooks after hydration', async () => {
		const serverRouter = server.makeCompiledRouter('/items/a', { isServer: true });
		await serverRouter.load();
		const { html } = renderToString(provider, { router: serverRouter });

		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const header = container.querySelector('header');
		const items = container.querySelector('.items-layout');
		const item = container.querySelector('.item');
		expect(header?.getAttribute('data-selected')).toBe('/items/$id');
		expect(item?.querySelector('.value')?.textContent).toBe('a:Name a');

		const router = makeCompiledRouter('/items/a');
		await router.load();
		const errors: unknown[] = [];
		const root = hydrateRoot(
			container,
			client as any,
			{ router },
			{ onRecoverableError: (error) => errors.push(error) },
		);
		try {
			await settle();
			expect(errors).toEqual([]);
			expect(container.querySelector('header')).toBe(header);
			expect(container.querySelector('.items-layout')).toBe(items);
			expect(container.querySelector('.item')).toBe(item);
			(container.querySelector('.count') as HTMLButtonElement).click();
			await nextPaint();
			expect(container.querySelector('.count')?.textContent).toBe('1');

			await router.navigate({ to: '/items/b' });
			await settle();
			expect(errors).toEqual([]);
			expect(container.querySelector('header')).toBe(header);
			expect(container.querySelector('.items-layout')).toBe(items);
			expect(container.querySelector('.value')?.textContent).toBe('b:Name b');
			expect(container.querySelector('.count')?.textContent).toBe('0');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
