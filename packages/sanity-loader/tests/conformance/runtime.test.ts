import { describe, expect, it, vi } from 'vitest';
import * as sanityLoader from '@octanejs/sanity-loader';
import * as upstream from '@sanity/react-loader';
import { flushEffects, mount } from '../../../octane/tests/_helpers.js';
import { createQueryStore as createClientQueryStore } from '../../src/createQueryStore/client-only';
import { createQueryStore as createServerQueryStore } from '../../src/createQueryStore/server-only';
import { defineUseLiveMode } from '../../src/defineUseLiveMode';
import { defineStudioUrlStore } from '../../src/defineStudioUrlStore';
import { InitialQuery, QuerySnapshot } from '../_fixtures/initial-query.tsrx';
import { LiveModeStudioUrl } from '../_fixtures/live-mode-studio-url.tsrx';
import { OptionalQueryArguments } from '../_fixtures/optional-query-arguments.tsrx';

describe('@octanejs/sanity-loader — runtime', () => {
	it('matches the upstream root runtime export names', () => {
		expect(Object.keys(sanityLoader).sort()).toEqual(Object.keys(upstream).sort());
	});

	it('hydrates useQuery from initial data', () => {
		const mounted = mount(InitialQuery);
		expect(mounted.find('output').textContent).toBe('Octane and Sanity');
		expect(mounted.find('output').getAttribute('data-loading')).toBe('false');
		mounted.unmount();
	});

	it('publishes the current snapshot immediately when the query changes', () => {
		const { useQuery } = sanityLoader.createQueryStore({ client: false, ssr: true });
		const first = {
			data: { title: 'First query' },
			sourceMap: undefined,
		};
		const second = {
			data: { title: 'Second query' },
			sourceMap: undefined,
		};
		const mounted = mount(QuerySnapshot, { useQuery, query: 'first', initial: first });
		flushEffects();

		expect(mounted.find('output').textContent).toBe('First query');
		mounted.update(QuerySnapshot, { useQuery, query: 'second', initial: second });
		expect(mounted.find('output').textContent).toBe('Second query');

		mounted.unmount();
	});

	it('accepts omitted options from compiled components', () => {
		const mounted = mount(OptionalQueryArguments);
		const expected = 'The `initial` option is required when `ssr: true`';
		expect(mounted.find('[data-call="query-only"]').textContent).toBe(expected);
		expect(mounted.find('[data-call="query-with-params"]').textContent).toBe(expected);
		mounted.unmount();
	});

	// OCTANE DIVERGENCE: @sanity/react-loader@2.2.1 uses an operator-precedence expression
	// that discards an explicit studioUrl; the public option must win over the client fallback.
	it('prefers an explicit Live Mode Studio URL and falls back to the client configuration', () => {
		const explicitStudioUrl = 'https://explicit.sanity.studio';
		const clientStudioUrl = 'https://client.sanity.studio';
		const setStudioUrl = vi.fn();
		const useLiveMode = defineUseLiveMode({
			enableLiveMode: vi.fn(() => vi.fn()),
			setStudioUrl,
		});

		const explicit = mount(LiveModeStudioUrl, {
			useLiveMode,
			options: { studioUrl: explicitStudioUrl },
		});
		flushEffects();
		expect(setStudioUrl).toHaveBeenLastCalledWith(explicitStudioUrl);
		explicit.unmount();

		const client = {
			config: () => ({ stega: { studioUrl: clientStudioUrl } }),
		} as NonNullable<Parameters<typeof useLiveMode>[0]['client']>;
		const fallback = mount(LiveModeStudioUrl, {
			useLiveMode,
			options: { client },
		});
		flushEffects();
		expect(setStudioUrl).toHaveBeenLastCalledWith(clientStudioUrl);
		fallback.unmount();
	});

	it('notifies studio URL subscribers and preserves the server snapshot', () => {
		const store = defineStudioUrlStore(false);
		const subscriber = vi.fn();
		const unsubscribe = store.subscribe(subscriber);
		store.setStudioUrl('https://octane.sanity.studio');
		expect(store.getSnapshot()).toBe('https://octane.sanity.studio');
		expect(store.getServerSnapshot()).toBeUndefined();
		expect(subscriber).toHaveBeenCalledOnce();
		unsubscribe();
		store.setStudioUrl(undefined);
		expect(subscriber).toHaveBeenCalledOnce();
	});

	it('enforces browser and server entry boundaries', () => {
		const browserStore = createClientQueryStore({ client: false, ssr: true });
		expect(() => browserStore.loadQuery('*[]')).toThrow('server only');
		expect(() => browserStore.setServerClient(false)).toThrow('server only');
		expect(() => createServerQueryStore({ client: false, ssr: false })).toThrow(
			'`ssr` option must be `true`',
		);
	});
});
