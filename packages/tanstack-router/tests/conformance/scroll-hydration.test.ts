import { hydrateRoot } from 'octane';
import { act } from '@octanejs/testing-library';
import { expect, it } from 'vitest';
import { RouterProvider } from '../../src';
import { makeScrollRouter } from '../_fixtures/scroll-hydration';
import { runServerFixture } from '../ssr-fixture';

it.each([true, false])(
	'preserves SSR input identity while adopting scroll restoration (%s)',
	async (enabled) => {
		const html = await runServerFixture<string>(
			'_fixtures/scroll-hydration.tsx',
			'renderScrollPage',
			enabled,
		);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const input = container.querySelector('input')!;
		input.value = 'edited before hydration';
		input.focus();
		const router = makeScrollRouter(false, enabled);
		await router.load();
		const errors: unknown[] = [];
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			await act(async () => {
				root = hydrateRoot(
					container,
					RouterProvider,
					{ router },
					{ onRecoverableError: (error) => errors.push(error) },
				);
			});
			expect(errors).toEqual([]);
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('edited before hydration');
			expect(document.activeElement).toBe(input);
		} finally {
			await act(async () => root?.unmount());
			container.remove();
		}
	},
);
