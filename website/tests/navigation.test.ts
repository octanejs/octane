// Client-side navigation smoke — click a router <Link> and swap routes through
// the REAL app stack. Regression test for the home → docs route swap crashing
// with "Failed to execute 'removeChild' on 'Node'" during teardown.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup, fireEvent } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router';
import { makeRouter } from '../src/app/router.ts';

afterEach(cleanup);

describe('client-side navigation', () => {
	it('home → differences-from-react via the hero Link, without DOM errors', async () => {
		const errors: unknown[] = [];
		const spy = vi.spyOn(console, 'error').mockImplementation((...a) => {
			errors.push(a);
		});
		const onError = (e: ErrorEvent) => errors.push(e.error ?? e.message);
		window.addEventListener('error', onError);
		try {
			const router = makeRouter({ history: createMemoryHistory({ initialEntries: ['/'] }) });
			await router.load();
			const utils = render(RouterProvider as any, { props: { router } });
			await waitFor(() => {
				if (!utils.container.querySelector('.hero-actions')) throw new Error('home not committed');
			});

			const link = utils.container.querySelector('a.btn-ghost') as HTMLAnchorElement;
			expect(link?.getAttribute('href')).toContain('differences-from-react');
			fireEvent.click(link);

			await waitFor(
				() => {
					if (!(utils.container.textContent ?? '').includes('Differences from React')) {
						throw new Error('docs page not committed');
					}
					if (utils.container.querySelector('.hero-actions')) {
						throw new Error('home page not torn down');
					}
				},
				{ timeout: 5000 },
			);
		} finally {
			window.removeEventListener('error', onError);
			spy.mockRestore();
		}
		expect(errors).toEqual([]);
	}, 20000);
});
