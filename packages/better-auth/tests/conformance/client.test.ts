import { atom, map } from 'nanostores';
import { describe, expect, it, vi } from 'vitest';
import { createAuthClient } from '@octanejs/better-auth';
import { mount, nextPaint } from '../_helpers';
import {
	KeyStoreReader,
	PluginStoreReader,
	SessionReader,
	StoreReader,
} from '../_fixtures/client.tsrx';

function sessionResponse(name: string) {
	return new Response(
		JSON.stringify({
			user: { id: 'user-1', name, email: 'ada@example.com', emailVerified: true },
			session: {
				id: 'session-1',
				userId: 'user-1',
				token: 'secret',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				expiresAt: new Date(Date.now() + 60_000).toISOString(),
			},
		}),
		{ headers: { 'content-type': 'application/json' } },
	);
}

describe('createAuthClient', () => {
	// Upstream: better-auth/src/client/react/index.ts (resolved atom hooks).
	it('reports the session loading and user states', async () => {
		const fetch = vi.fn(async () => sessionResponse('Ada'));
		const client = createAuthClient({
			baseURL: 'http://localhost/api/auth',
			fetchOptions: { customFetchImpl: fetch },
		});
		const result = mount(SessionReader, { client });

		expect(result.find('#session').textContent).toBe('pending');
		await vi.waitFor(() => expect(result.find('#session').textContent).toBe('Ada'));
		expect(fetch).toHaveBeenCalledTimes(1);
		result.unmount();
	});

	// Upstream: better-auth/src/client/react/index.ts (plugin atom hooks).
	it('exposes plugin-provided atoms as dynamically named hooks', async () => {
		const activeOrganization = atom('alpha');
		const client = createAuthClient({
			baseURL: 'http://localhost/api/auth',
			plugins: [
				{
					id: 'organization-test',
					getAtoms: () => ({ activeOrganization }),
				},
			],
		});
		const result = mount(PluginStoreReader, { client });

		expect(result.find('#organization').textContent).toBe('alpha');
		activeOrganization.set('beta');
		await nextPaint();
		expect(result.find('#organization').textContent).toBe('beta');
		result.unmount();
	});

	// Upstream: better-auth/src/client/react/index.ts (plugin and endpoint actions).
	it('preserves Better Auth endpoint actions', async () => {
		const fetch = vi.fn(async () => new Response(JSON.stringify({ user: null })));
		const client = createAuthClient({
			baseURL: 'http://localhost/api/auth',
			fetchOptions: { customFetchImpl: fetch },
		});

		await client.signIn.email({ email: 'ada@example.com', password: 'secret-password' });

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0]?.[0].toString()).toBe('http://localhost/api/auth/sign-in/email');
		expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
	});

	// Upstream: better-auth/src/client/react/index.ts (actions and hooks share the client).
	it('preserves plugin actions whose names start with use', () => {
		const client = createAuthClient({
			plugins: [
				{
					id: 'use-prefixed-action',
					getActions: () => ({ useWidget: () => 'action-result' }),
				},
			],
		});

		expect(client.useWidget()).toBe('action-result');
	});

	it('preserves store-shaped plugin actions whose names start with use', () => {
		const client = createAuthClient({
			plugins: [
				{
					id: 'store-shaped-action',
					getActions: () => ({
						useWidget: {
							get: () => 'action-result',
							listen: () => () => {},
						},
					}),
				},
			],
		});

		expect(client.useWidget.get()).toBe('action-result');
	});
});

describe('useStore', () => {
	// Upstream: better-auth/src/client/react/react-store.ts.
	it('subscribes to Nanostores updates and cleans up on unmount', async () => {
		const value = atom(1);
		let subscriptions = 0;
		const store = {
			get: () => value.get(),
			get value() {
				return value.get();
			},
			listen(listener: (next: number) => void) {
				subscriptions++;
				const unbind = value.listen(listener);
				return () => {
					subscriptions--;
					unbind();
				};
			},
		};
		const result = mount(StoreReader, { store });
		await nextPaint();

		expect(result.find('#store-value').textContent).toBe('1');
		expect(subscriptions).toBe(1);
		value.set(2);
		await nextPaint();
		expect(result.find('#store-value').textContent).toBe('2');

		result.unmount();
		await nextPaint();
		expect(subscriptions).toBe(0);
	});

	it('switches subscriptions when the store changes', async () => {
		const first = atom(1);
		const second = atom(2);
		const result = mount(StoreReader, { store: first });

		result.update(StoreReader, { store: second });
		expect(result.find('#store-value').textContent).toBe('2');

		first.set(3);
		await nextPaint();
		expect(result.find('#store-value').textContent).toBe('2');

		second.set(4);
		await nextPaint();
		expect(result.find('#store-value').textContent).toBe('4');
		result.unmount();
	});

	it('filters map-store notifications to selected keys', async () => {
		const store = map({ selected: 1, ignored: 1 });
		let renders = 0;
		const result = mount(KeyStoreReader, { store, onRender: () => renders++ });
		await nextPaint();

		expect(result.find('#key-store-value').textContent).toBe('1:1');
		expect(renders).toBe(1);

		store.setKey('ignored', 2);
		await nextPaint();
		expect(renders).toBe(1);

		store.setKey('selected', 2);
		await nextPaint();
		expect(result.find('#key-store-value').textContent).toBe('2:2');
		expect(renders).toBe(2);
		result.unmount();
	});
});
