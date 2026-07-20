import { HYDRATION_RANGE_BOUNDARY, createRoot, drainPassiveEffects, flushSync } from 'octane';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyRouter } from '@tanstack/router-core';

const runtimeMocks = vi.hoisted(() => ({
	coreHydrateStart: vi.fn<() => Promise<AnyRouter>>(),
	providerRender: vi.fn(() => undefined),
}));

vi.mock('@tanstack/start-client-core/client', () => ({
	hydrateStart: runtimeMocks.coreHydrateStart,
}));

vi.mock('@octanejs/tanstack-router', () => ({
	RouterProvider: runtimeMocks.providerRender,
}));

import { StartClient, hydrateStart } from '@octanejs/tanstack-start/client';
import { StartServer } from '@octanejs/tanstack-start/server';

type TestMatchesStore = {
	get: () => Array<string>;
	subscribe: (listener: () => void) => { unsubscribe: () => void };
	commit: (matches: Array<string>) => void;
	subscriberCount: () => number;
};

function createMatchesStore(): TestMatchesStore {
	let matches: Array<string> = [];
	const listeners = new Set<() => void>();

	return {
		get: () => matches,
		subscribe(listener) {
			listeners.add(listener);
			return { unsubscribe: () => listeners.delete(listener) };
		},
		commit(nextMatches) {
			matches = nextMatches;
			listeners.forEach((listener) => listener());
		},
		subscriberCount: () => listeners.size,
	};
}

function createRouter(store: TestMatchesStore): AnyRouter {
	return {
		stores: { matchesId: store },
	} as unknown as AnyRouter;
}

beforeEach(() => {
	runtimeMocks.coreHydrateStart.mockReset();
	runtimeMocks.providerRender.mockClear();
});

describe('TanStack Start runtime adapters', () => {
	it('waits for router matches before exposing the hydrated router', async () => {
		const store = createMatchesStore();
		const router = createRouter(store);
		runtimeMocks.coreHydrateStart.mockResolvedValue(router);

		let resolved = false;
		const hydration = hydrateStart().then((result) => {
			resolved = true;
			return result;
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(resolved).toBe(false);
		expect(store.subscriberCount()).toBe(1);

		store.commit(['__root__']);

		await expect(hydration).resolves.toBe(router);
		expect(store.subscriberCount()).toBe(0);
	});

	it('renders the client provider before signaling hydration readiness', () => {
		const router = {} as AnyRouter;
		const onHydrated = vi.fn();
		const previousTsr = window.$_TSR;
		window.$_TSR = { h: onHydrated } as typeof window.$_TSR;
		const container = document.createElement('div');
		const root = createRoot(container);

		try {
			expect(
				(
					StartClient as typeof StartClient & {
						[HYDRATION_RANGE_BOUNDARY]?: string;
					}
				)[HYDRATION_RANGE_BOUNDARY],
			).toBe('passthrough');

			root.render(StartClient, { router });
			flushSync(() => {});

			expect(runtimeMocks.providerRender.mock.calls[0]?.[0]).toEqual({ router });
			expect(onHydrated).not.toHaveBeenCalled();

			drainPassiveEffects();
			expect(onHydrated).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
			window.$_TSR = previousTsr;
		}
	});

	it('passes the request router to the server provider', () => {
		const router = {} as AnyRouter;
		const element = StartServer({ router });

		expect(element.type).toBe(runtimeMocks.providerRender);
		expect(element.props).toEqual({ router });
	});
});
