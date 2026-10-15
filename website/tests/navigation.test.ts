// Client-side navigation smoke — click a router <Link> and swap routes through
// the REAL app stack. Regression test for the home → docs route swap crashing
// with "Failed to execute 'removeChild' on 'Node'" during teardown.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup, fireEvent } from '@octanejs/testing-library';
import { RouterProvider, createMemoryHistory } from '@octanejs/tanstack-router/compiled';
import { getRouter } from '../src/router.ts';
import { OnThisPage } from '../src/components/OnThisPage.tsrx';

afterEach(cleanup);

it('discards an earlier section selection when returning through another page', async () => {
	const originalUrl = window.location.href;
	const headings = document.createElement('article');
	headings.innerHTML = '<h2 id="first">First</h2><h2 id="last">Last</h2>';
	document.body.appendChild(headings);
	const sections = [
		{ id: 'first', title: 'First' },
		{ id: 'last', title: 'Last' },
	];
	try {
		const mounted = render(OnThisPage, { props: { sections, resetKey: 'a' } });
		const current = () => mounted.container.querySelector('a[aria-current="true"]')?.textContent;
		await waitFor(() => expect(current()).toBe('Last'));
		fireEvent.click(mounted.getByRole('link', { name: 'First' }));
		expect(current()).toBe('First');
		mounted.rerender({ props: { sections, resetKey: 'b' } });
		await waitFor(() => expect(current()).toBe('Last'));
		mounted.rerender({ props: { sections, resetKey: 'a' } });
		await waitFor(() => expect(current()).toBe('Last'));
	} finally {
		headings.remove();
		window.history.replaceState(null, '', originalUrl);
	}
});

describe('client-side navigation', () => {
	it('home → differences-from-react via the hero Link, without DOM errors', async () => {
		const errors: unknown[] = [];
		const spy = vi.spyOn(console, 'error').mockImplementation((...a) => {
			errors.push(a);
		});
		const onError = (e: ErrorEvent) => errors.push(e.error ?? e.message);
		window.addEventListener('error', onError);
		try {
			const router = getRouter({ history: createMemoryHistory({ initialEntries: ['/'] }) });
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
					const activeDoc = utils.container.querySelector(
						'a.sidebar-link[href="/docs/differences-from-react"][data-status="active"]',
					);
					if (!utils.container.querySelector('.prose') || !activeDoc) {
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
