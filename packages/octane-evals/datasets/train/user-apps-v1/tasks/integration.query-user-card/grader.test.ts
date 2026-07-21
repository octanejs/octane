import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@octanejs/tanstack-query';
import { cleanup, render, screen, waitFor } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/integration.query-user-card/src/App.tsrx';

interface User {
	id: string;
	name: string;
	email: string;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function queryClient(): QueryClient {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(cleanup);

describe('TanStack Query user card', () => {
	it('moves from loading to the resolved user', async () => {
		const request = deferred<User>();
		const loadUser = vi.fn(() => request.promise);
		render(App, { props: { client: queryClient(), userId: '1', loadUser } });

		expect(screen.getByRole('status').textContent).toBe('Loading user…');
		expect(loadUser).toHaveBeenCalledWith('1');

		request.resolve({ id: '1', name: 'Ada Lovelace', email: 'ada@example.com' });
		await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Ada Lovelace'));
		expect(screen.getByText('ada@example.com')).toBeTruthy();
	});

	it('renders a loader failure without retrying', async () => {
		const loadUser = vi.fn(async () => {
			throw new Error('offline');
		});
		render(App, { props: { client: queryClient(), userId: '1', loadUser } });

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe('Could not load user: offline'),
		);
		expect(loadUser).toHaveBeenCalledTimes(1);
	});

	it('loads a different cache entry when the user ID changes', async () => {
		const loadUser = vi.fn(async (id: string): Promise<User> =>
			id === '1'
				? { id, name: 'Ada Lovelace', email: 'ada@example.com' }
				: { id, name: 'Grace Hopper', email: 'grace@example.com' },
		);
		const client = queryClient();
		const view = render(App, { props: { client, userId: '1', loadUser } });
		await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Ada Lovelace'));

		view.rerender(App, { props: { client, userId: '2', loadUser } });
		await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Grace Hopper'));
		expect(screen.getByText('grace@example.com')).toBeTruthy();
		expect(loadUser.mock.calls.map(([id]) => id)).toEqual(['1', '2']);
	});
});
