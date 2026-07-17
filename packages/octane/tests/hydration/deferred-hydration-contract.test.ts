import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from 'octane';
import {
	condition,
	idle,
	interaction,
	load,
	media,
	never,
	visible,
	type HydrationPrefetchContext,
} from 'octane/hydration';
import { renderToString } from 'octane/server';
import { flushEffects } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/deferred-hydration-contract.tsrx';

const FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-contract.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

describe('deferred hydration contract edges', () => {
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | undefined;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('captures and replays interaction intent dispatched before hydrateRoot', () => {
		const when = interaction({ events: 'click' });
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const { html } = renderToString(server.EarlyInteractionHydration, { when });
		container.innerHTML = html;
		const button = container.querySelector('#early-interaction') as HTMLButtonElement;

		button.click();
		expect(onClick).not.toHaveBeenCalled();

		root = hydrateRoot(container, client.EarlyInteractionHydration, {
			when,
			onClick,
			onHydrated,
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#early-interaction')).toBe(button);
		expect(onHydrated).toHaveBeenCalledOnce();
		expect(onClick).toHaveBeenCalledOnce();
	});

	it('uses a current direct never strategy instead of the previously rendered condition', async () => {
		const initialWhen = condition(false);
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		container.innerHTML = renderToString(server.EarlyInteractionHydration, {
			when: initialWhen,
		}).html;
		const button = container.querySelector('#early-interaction') as HTMLButtonElement;

		root = hydrateRoot(container, client.EarlyInteractionHydration, {
			when: initialWhen,
			onClick,
			onHydrated,
		});
		await act(() => {});

		await act(() =>
			root!.render(client.EarlyInteractionHydration, {
				when: never(),
				onClick,
				onHydrated,
			}),
		);

		expect(container.querySelector('#early-interaction')).toBe(button);
		expect(onHydrated).not.toHaveBeenCalled();
		await act(() => button.click());
		expect(onClick).not.toHaveBeenCalled();
	});

	it('tears down an installed strategy when a direct prop updates to never', async () => {
		vi.useFakeTimers();
		let prefetchReason: string | undefined;
		const prefetch = vi.fn(async ({ waitFor }: HydrationPrefetchContext) => {
			prefetchReason = await waitFor(idle({ timeout: 100_000 }));
		});
		const initialWhen = idle({ timeout: 25 });
		const onHydrated = vi.fn();
		const props = { when: initialWhen, prefetch, onHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;

		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		flushSync(() => {});
		flushEffects();
		expect(prefetch).toHaveBeenCalledOnce();
		expect(onHydrated).not.toHaveBeenCalled();

		flushSync(() =>
			root!.render(client.ProceduralPrefetchHydration, {
				...props,
				when: never(),
			}),
		);
		flushEffects();
		await act(() => vi.advanceTimersByTime(25));

		expect(onHydrated).not.toHaveBeenCalled();
		expect(prefetchReason).toBeUndefined();

		root.unmount();
		root = undefined;
		flushEffects();
		await Promise.resolve();
		expect(prefetchReason).toBe('abort');
	});

	it('uses a current direct load strategy instead of the previously rendered never', async () => {
		const initialWhen = never();
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		container.innerHTML = renderToString(server.EarlyInteractionHydration, {
			when: initialWhen,
		}).html;
		const button = container.querySelector('#early-interaction') as HTMLButtonElement;

		root = hydrateRoot(container, client.EarlyInteractionHydration, {
			when: initialWhen,
			onClick,
			onHydrated,
		});
		await act(() => {});
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() =>
			root!.render(client.EarlyInteractionHydration, {
				when: load(),
				onClick,
				onHydrated,
			}),
		);

		expect(container.querySelector('#early-interaction')).toBe(button);
		expect(onHydrated).toHaveBeenCalledOnce();
		await act(() => button.click());
		expect(onClick).toHaveBeenCalledOnce();
	});

	it('cancels an in-flight activation on never and can activate again later', async () => {
		const preparation = deferred<void>();
		const prefetch = vi.fn(() => preparation.promise);
		const onHydrated = vi.fn();
		const props = { when: load(), prefetch, onHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		const button = container.querySelector('#procedural-prefetch');

		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		expect(prefetch).toHaveBeenCalledOnce();
		expect(onHydrated).not.toHaveBeenCalled();

		flushSync(() =>
			root!.render(client.ProceduralPrefetchHydration, {
				...props,
				when: never(),
			}),
		);
		await act(() => preparation.resolve());

		expect(container.querySelector('#procedural-prefetch')).toBe(button);
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() =>
			root!.render(client.ProceduralPrefetchHydration, {
				...props,
				when: load(),
			}),
		);

		expect(container.querySelector('#procedural-prefetch')).toBe(button);
		expect(prefetch).toHaveBeenCalledOnce();
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('reports hydrate when procedural waitFor subscribes after load requested activation', async () => {
		let reason: string | undefined;
		const onHydrated = vi.fn();
		const prefetch = vi.fn(async ({ waitFor }: HydrationPrefetchContext) => {
			reason = await waitFor(visible());
		});
		const props = { when: load(), prefetch, onHydrated };
		const { html } = renderToString(server.ProceduralPrefetchHydration, props);
		container.innerHTML = html;

		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		await act(() => {});

		expect(prefetch).toHaveBeenCalledOnce();
		expect(reason).toBe('hydrate');
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('blocks load hydration on awaited procedural work but not fire-and-forget work', async () => {
		const required = deferred<void>();
		const onRequiredHydrated = vi.fn();
		const requiredProps = {
			when: load(),
			prefetch: async () => required.promise,
			onHydrated: onRequiredHydrated,
		};
		let html = renderToString(server.ProceduralPrefetchHydration, requiredProps).html;
		container.innerHTML = html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, requiredProps);
		flushSync(() => {});
		flushEffects();
		expect(onRequiredHydrated).not.toHaveBeenCalled();

		await act(() => required.resolve());
		expect(onRequiredHydrated).toHaveBeenCalledOnce();
		root.unmount();
		root = undefined;

		const optional = deferred<void>();
		const onOptionalHydrated = vi.fn();
		const optionalProps = {
			when: load(),
			prefetch: () => {
				void optional.promise;
			},
			onHydrated: onOptionalHydrated,
		};
		html = renderToString(server.ProceduralPrefetchHydration, optionalProps).html;
		container.innerHTML = html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, optionalProps);
		flushSync(() => {});
		flushEffects();

		expect(onOptionalHydrated).toHaveBeenCalledOnce();
	});

	it('reports prefetch and abort outcomes from procedural waitFor', async () => {
		let reason: string | undefined;
		const prefetch = async ({ waitFor }: HydrationPrefetchContext) => {
			reason = await waitFor(load());
		};
		const props = { when: condition(false), prefetch };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		await act(() => {});
		expect(reason).toBe('prefetch');

		root.unmount();
		root = undefined;
		reason = undefined;
		const abortingPrefetch = async ({ waitFor }: HydrationPrefetchContext) => {
			reason = await waitFor(idle({ timeout: 100_000 }));
		};
		const abortProps = { when: condition(false), prefetch: abortingPrefetch };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, abortProps).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, abortProps);
		flushSync(() => {});
		flushEffects();
		root.unmount();
		root = undefined;
		flushEffects();
		await Promise.resolve();

		expect(reason).toBe('abort');
	});

	it('hydrates from idle, visibility, and media-query strategies', async () => {
		vi.useFakeTimers();
		const onIdleHydrated = vi.fn();
		let props = { when: idle({ timeout: 25 }), onHydrated: onIdleHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		flushSync(() => {});
		flushEffects();
		expect(onIdleHydrated).not.toHaveBeenCalled();
		await act(() => vi.advanceTimersByTime(25));
		expect(onIdleHydrated).toHaveBeenCalledOnce();
		root.unmount();
		root = undefined;
		vi.useRealTimers();

		let intersect!: IntersectionObserverCallback;
		const observe = vi.fn();
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(callback: IntersectionObserverCallback) {
					intersect = callback;
				}
				observe = observe;
				unobserve = vi.fn();
				disconnect = vi.fn();
			},
		);
		const onVisibleHydrated = vi.fn();
		props = { when: visible({ rootMargin: '321px' }), onHydrated: onVisibleHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		flushSync(() => {});
		flushEffects();
		const visibleWrapper = container.querySelector('#procedural-prefetch')!.parentElement!;
		expect(observe).toHaveBeenCalledWith(visibleWrapper);
		await act(() =>
			intersect(
				[{ isIntersecting: true, target: visibleWrapper } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			),
		);
		expect(onVisibleHydrated).toHaveBeenCalledOnce();
		root.unmount();
		root = undefined;

		let mediaListener!: () => void;
		const mediaQuery = {
			matches: false,
			addEventListener: vi.fn((_name: string, listener: () => void) => {
				mediaListener = listener;
			}),
			removeEventListener: vi.fn(),
		};
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => mediaQuery),
		);
		const onMediaHydrated = vi.fn();
		props = { when: media('(min-width: 800px)'), onHydrated: onMediaHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		flushSync(() => {});
		flushEffects();
		expect(onMediaHydrated).not.toHaveBeenCalled();
		mediaQuery.matches = true;
		await act(() => mediaListener());
		expect(onMediaHydrated).toHaveBeenCalledOnce();
	});

	it('keeps initial server content instead of showing authored fallback when activation suspends', async () => {
		const pending = deferred<void>();
		const onHydrated = vi.fn();
		const blocked = condition(false);
		const serverProps = {
			when: blocked,
			suspend: false,
			promise: pending.promise,
			onHydrated,
			shellLabel: 'Initial shell',
		};
		const { html } = renderToString(server.ActivationSuspendingHydration, serverProps);
		container.innerHTML = html;
		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');

		root = hydrateRoot(container, client.ActivationSuspendingHydration, {
			...serverProps,
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		root.render(client.ActivationSuspendingHydration, {
			...serverProps,
			when: condition(true),
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');
		expect(container.querySelector('#activation-fallback')).toBeNull();
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() => pending.resolve());

		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');
		expect(container.querySelector('#activation-fallback')).toBeNull();
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('preserves pending server content across a parent update during activation', async () => {
		const pending = deferred<void>();
		const onHydrated = vi.fn();
		const blocked = condition(false);
		const ready = condition(true);
		const serverProps = {
			when: blocked,
			suspend: false,
			promise: pending.promise,
			onHydrated,
			shellLabel: 'Initial shell',
		};
		container.innerHTML = renderToString(server.ActivationSuspendingHydration, serverProps).html;
		root = hydrateRoot(container, client.ActivationSuspendingHydration, {
			...serverProps,
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		root.render(client.ActivationSuspendingHydration, {
			...serverProps,
			when: ready,
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		const pendingContent = container.querySelector('#activation-content') as HTMLButtonElement;
		pendingContent.focus();
		expect(document.activeElement).toBe(pendingContent);

		root.render(client.ActivationSuspendingHydration, {
			...serverProps,
			when: ready,
			suspend: true,
			shellLabel: 'Updated shell',
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#activation-shell')?.textContent).toBe('Updated shell');
		expect(container.querySelector('#activation-content')).toBe(pendingContent);
		expect(document.activeElement).toBe(pendingContent);
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() => pending.resolve());

		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');
		expect(onHydrated).toHaveBeenCalledOnce();
	});
});
