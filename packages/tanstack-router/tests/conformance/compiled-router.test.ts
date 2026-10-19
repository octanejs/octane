import { describe, expect, it, vi } from 'vitest';
import { createRoot, startTransition } from 'octane';
import {
	CompiledRouterProvider,
	PreconfiguredRouterProvider,
} from '@octanejs/tanstack-router/compiled';
import { mount, nextPaint } from '../_helpers';
import { makeCompiledRouter, makeCompiledFileRouter } from '../_fixtures/compiled-router.tsrx';
import { createDeferred } from '../_fixtures/concurrent-navigation.tsrx';

async function settle() {
	for (let i = 0; i < 6; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}

describe('opt-in compiled router rendering', () => {
	it.each([false, true])(
		'keeps the visible route during an urgent provider update while navigation suspends (async action: %s)',
		async (asyncAction) => {
			const deferred = createDeferred<string>();
			const router = makeCompiledRouter('/', { componentPromise: deferred.promise });
			await router.load();
			const view = mount(CompiledRouterProvider as any, { router });
			await settle();
			const home = view.find('.go-item');
			const visible: boolean[] = [];
			const observer = new MutationObserver(() => visible.push(home.isConnected));
			try {
				observer.observe(view.container, { childList: true, subtree: true });
				if (asyncAction)
					startTransition(async () => {
						await router.navigate({ to: '/items/a' });
					});
				else void router.navigate({ to: '/items/a' });
				await settle();
				expect(view.find('.go-item')).toBe(home);
				view.update(CompiledRouterProvider as any, { router, defaultPreload: 'intent' });
				await settle();
				observer.disconnect();
				expect(visible).not.toContain(false);
				expect(view.find('.go-item')).toBe(home);
				expect(view.findAll('.suspended-item')).toHaveLength(0);
				deferred.resolve('Slow page');
				await settle();
				expect(view.find('.suspended-item').textContent).toBe('Slow page');
			} finally {
				observer.disconnect();
				view.unmount();
			}
		},
	);

	it.each(['invalidate', 'navigate', 'same-route', 'load'] as const)(
		'settles an async action awaiting router.%s',
		async (operation) => {
			const router = makeCompiledRouter('/');
			await router.load();
			const view = mount(CompiledRouterProvider as any, { router });
			await settle();
			let settled = false;
			let failure: unknown;
			try {
				startTransition(async () => {
					try {
						if (operation === 'invalidate') await router.invalidate({ sync: true });
						else if (operation === 'same-route') {
							for (let i = 0; i < 3; i++) await router.navigate({ to: '/' });
						} else if (operation === 'load') {
							for (let i = 0; i < 3; i++) await router.load({ sync: true });
						} else await router.navigate({ to: '/items/a' });
						settled = true;
					} catch (error) {
						failure = error;
					}
				});
				await settle();
				expect(failure).toBeUndefined();
				expect(settled).toBe(true);
				expect(view.find(operation === 'navigate' ? '.value' : '.go-item').textContent).toBe(
					operation === 'navigate' ? 'a:Name a' : 'Open item',
				);
			} finally {
				view.unmount();
			}
		},
	);

	it('navigates from a route layout effect when its provider mounts', async () => {
		const router = makeCompiledRouter('/items/a', { navigateOnMount: true });
		await router.load();
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const resolvedContent: Array<string | null> = [];
		const unsubscribe = router.subscribe('onResolved', () => {
			resolvedContent.push(container.querySelector('.go-item')?.textContent ?? null);
		});
		try {
			root.render(PreconfiguredRouterProvider as any, { router });
			await settle();
			expect(resolvedContent).toContain('Open item');
			expect(container.querySelector('.go-item')?.textContent).toBe('Open item');
			expect(router.state.resolvedLocation?.pathname).toBe('/');
		} finally {
			unsubscribe();
			root.unmount();
			container.remove();
		}
	});

	it('follows history only while its router is active in the provider', async () => {
		const previous = makeCompiledRouter('/');
		await previous.load();
		const view = mount(PreconfiguredRouterProvider as any, { router: previous });
		const replacement = makeCompiledRouter('/items/b');
		try {
			await settle();
			view.update(PreconfiguredRouterProvider as any, { router: replacement });
			await settle();
			expect(view.find('.value').textContent).toBe('b:Name b');
			previous.history.push('/items/a');
			await settle();
			expect(previous.state.location.pathname).toBe('/');
			expect(view.find('.value').textContent).toBe('b:Name b');
		} finally {
			view.unmount();
		}
		replacement.history.push('/items/c');
		await settle();
		expect(replacement.state.location.pathname).toBe('/items/b');
	});

	it('preserves route state when provider options change', async () => {
		const router = makeCompiledRouter('/items/a');
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			const item = view.find('.item');
			view.click('.count');
			expect(view.find('.count').textContent).toBe('1');
			view.update(CompiledRouterProvider as any, { router, defaultPendingMs: 50 });
			expect(router.options.defaultPendingMs).toBe(50);
			expect(view.find('.item')).toBe(item);
			expect(view.find('.count').textContent).toBe('1');
			view.update(CompiledRouterProvider as any, { router });
			expect(view.find('.item')).toBe(item);
			expect(view.find('.count').textContent).toBe('1');
		} finally {
			view.unmount();
		}
	});

	it('commits the Link transition cue before synchronous router callbacks', async () => {
		const router = makeCompiledFileRouter();
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			const link = view.find('.file-timing') as HTMLAnchorElement;
			const observations: unknown[] = [];
			const unsubscribe = router.subscribe('onBeforeNavigate', () => {
				observations.push([
					link.getAttribute('data-transitioning'),
					link.textContent,
					view.find('.file').getAttribute('data-menu'),
				]);
			});
			link.click();
			expect(observations).toEqual([['transitioning', 'true', 'false']]);
			await settle();
			expect(view.find('.file p').textContent).toBe('e:File e');
			expect(link.getAttribute('data-transitioning')).toBeNull();
			unsubscribe();
		} finally {
			view.unmount();
		}
	});

	it('binds generated and lazy file-route accessors and links to the compiled context', async () => {
		const router = makeCompiledFileRouter();
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			expect(view.find('.file p').textContent).toBe('a:File a');
			expect(view.find('.file').getAttribute('data-lazy')).toBe('a');
			view.click('.file-relative');
			await settle();
			expect(view.find('.file p').textContent).toBe('b:File b');
			expect(router.state.location.search).toEqual({ page: 2 });
			view.click('.file-api');
			await settle();
			expect(view.find('.file p').textContent).toBe('c:File c');
			view.click('.file button');
			await settle();
			expect(view.find('.file p').textContent).toBe('d:File d');
			view.click('.file-missing');
			await settle();
			expect(view.find('.not-found').textContent).toBe('route api missing');
			await router.navigate({ to: '/files/$id', params: { id: 'a' } } as any);
			await settle();
			expect(view.find('.file p').textContent).toBe('a:File a');
		} finally {
			view.unmount();
		}
	});

	it('keeps the root shell and exposes its nearest match while navigating', async () => {
		const router = makeCompiledRouter('/', { shell: true });
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			const shell = view.find('.document-shell');
			expect(shell.getAttribute('data-route')).toBe('__root__');
			expect(shell.getAttribute('data-context')).toBe('root context');
			await router.navigate({ to: '/items/a' });
			await settle();
			expect(view.find('.document-shell')).toBe(shell);
			expect(view.find('.value').textContent).toBe('a:Name a');
		} finally {
			view.unmount();
		}
	});

	it('renders lazy nested outlets, preserves parent identity and acknowledges committed navigation', async () => {
		const router = makeCompiledRouter();
		await router.load();
		const view = mount(PreconfiguredRouterProvider as any, { router });
		await settle();
		const header = view.find('header');
		expect(header.getAttribute('data-selected')).toBe('/');
		const events: Array<{ type: string; pathname: string; content: string | null }> = [];
		const unsubs = (['onLoad', 'onResolved', 'onRendered'] as const).map((type) =>
			router.subscribe(type, (event) =>
				events.push({
					type,
					pathname: event.toLocation.pathname,
					content: view.findAll('.value')[0]?.textContent ?? null,
				}),
			),
		);

		(view.find('.go-item') as HTMLButtonElement).click();
		await settle();
		expect(view.find('.value').textContent).toBe('a:Name a');
		expect(view.find('.item').getAttribute('data-path')).toBe('/items/a');
		expect(view.find('.item').getAttribute('data-back')).toBe('true');
		expect(header.getAttribute('data-selected')).toBe('/items/$id');
		const itemsLayout = view.find('.items-layout');
		(view.find('.count') as HTMLButtonElement).click();
		await nextPaint();
		expect(view.find('.count').textContent).toBe('1');

		await router.navigate({ to: '/items/b' });
		await settle();
		expect(view.find('header')).toBe(header);
		expect(view.find('.items-layout')).toBe(itemsLayout);
		expect(view.find('.value').textContent).toBe('b:Name b');
		expect(view.find('.count').textContent).toBe('0');
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: 'onLoad' }),
				{ type: 'onResolved', pathname: '/items/a', content: 'a:Name a' },
				{ type: 'onRendered', pathname: '/items/a', content: 'a:Name a' },
				{ type: 'onResolved', pathname: '/items/b', content: 'b:Name b' },
				{ type: 'onRendered', pathname: '/items/b', content: 'b:Name b' },
			]),
		);

		router.history.back();
		await settle();
		expect(view.find('.value').textContent).toBe('a:Name a');
		for (const unsub of unsubs) unsub();
		view.unmount();
	});

	it('uses route not-found data and clears the error on a known route', async () => {
		const router = makeCompiledRouter('/items/missing');
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		await settle();
		expect(view.find('.not-found').textContent).toBe('no item');
		await router.navigate({ to: '/items/a' });
		await settle();
		expect(view.findAll('.not-found')).toHaveLength(0);
		expect(view.find('.value').textContent).toBe('a:Name a');
		view.unmount();
	});

	it('shows the route pending view until its loader is ready', async () => {
		let release!: () => void;
		const waiting = new Promise<void>((resolve) => {
			release = resolve;
		});
		const router = makeCompiledRouter('/', { loader: () => waiting });
		router.options.defaultPendingMs = 1;
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		await settle();
		const header = view.find('header');
		const navigation = router.navigate({ to: '/items/a' });
		await settle();
		expect(view.findAll('.pending')).toHaveLength(1);
		expect(view.findAll('.item')).toHaveLength(0);
		release();
		await navigation;
		await settle();
		expect(view.findAll('.pending')).toHaveLength(0);
		expect(view.find('.value').textContent).toBe('a:Name a');
		expect(view.find('header')).toBe(header);
		view.unmount();
	});

	it('keeps the later destination when it supersedes a pending match', async () => {
		let release!: () => void;
		const waiting = new Promise<void>((resolve) => {
			release = resolve;
		});
		const router = makeCompiledRouter('/', { loader: () => waiting });
		router.options.defaultPendingMs = 1;
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			const navigation = router.navigate({ to: '/items/a' });
			await settle();
			expect(view.findAll('.pending')).toHaveLength(1);
			await router.navigate({ to: '/' });
			release();
			await navigation;
			await settle();
			expect(view.findAll('.pending')).toHaveLength(0);
			expect(view.findAll('.item')).toHaveLength(0);
			expect(view.find('.go-item').textContent).toBe('Open item');
			expect(router.state.resolvedLocation?.pathname).toBe('/');
		} finally {
			release();
			view.unmount();
		}
	});

	it('keeps the later destination pending when an obsolete loader finishes', async () => {
		const first = createDeferred<void>();
		const second = createDeferred<void>();
		let loaderPromise = first.promise;
		const router = makeCompiledRouter('/', { loader: () => loaderPromise });
		router.options.defaultPendingMs = 1;
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			const firstNavigation = router.navigate({ to: '/items/a' });
			await settle();
			expect(view.find('.pending').textContent).toBe('Loading');
			loaderPromise = second.promise;
			const secondNavigation = router.navigate({ to: '/items/b' });
			await settle();
			expect(router.state.location.pathname).toBe('/items/b');
			first.resolve();
			await settle();
			expect(view.find('.pending').textContent).toBe('Loading');
			expect(view.findAll('.item')).toHaveLength(0);
			second.resolve();
			await Promise.all([firstNavigation, secondNavigation]);
			await settle();
			expect(view.find('.value').textContent).toBe('b:Name b');
			expect(router.state.resolvedLocation?.pathname).toBe('/items/b');
		} finally {
			first.resolve();
			second.resolve();
			view.unmount();
		}
	});

	it('shows route errors inside the compiled layout', async () => {
		const router = makeCompiledRouter('/items/a', { rejected: true });
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		await settle();
		expect(view.find('.route-error').textContent).toBe('item failed');
		expect(view.find('header').textContent).toBe('Routes');
		view.unmount();
	});

	it('keeps the selected fallback when reporting an error and recovers when its match changes', async () => {
		const router = makeCompiledRouter('/items/broken', { renderError: true });
		const route = Object.values(router.routesById).find(({ id }) => String(id) === '/items/$id')!;
		const errorComponent = route.options.errorComponent;
		const onCatch = vi.fn<(error: unknown) => void>(() =>
			route.update({ errorComponent: undefined }),
		);
		route.update({ onCatch });
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			expect(view.find('.route-error').textContent).toBe('item render failed');
			expect(onCatch).toHaveBeenCalledTimes(1);
			expect(onCatch.mock.calls[0][0]).toMatchObject({ message: 'item render failed' });
			const parent = view.find('.items-layout');

			route.update({ errorComponent });
			await router.navigate({ to: '/items/a' });
			await settle();
			expect(view.find('.items-layout')).toBe(parent);
			expect(view.findAll('.route-error')).toHaveLength(0);
			expect(view.find('.value').textContent).toBe('a:Name a');
			expect(onCatch).toHaveBeenCalledTimes(1);
		} finally {
			view.unmount();
		}
	});

	it('places a render-time not-found at its owning route and recovers on navigation', async () => {
		const onCatch = vi.fn();
		const router = makeCompiledRouter('/items/render-missing', {
			renderError: true,
			onCatch,
			parentOnCatch: onCatch,
		});
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			expect(view.find('.not-found').textContent).toBe('render missing');
			expect(view.findAll('.items-layout')).toHaveLength(0);
			expect(view.find('header').textContent).toBe('Routes');
			expect(onCatch).not.toHaveBeenCalled();

			await router.navigate({ to: '/items/a' });
			await settle();
			expect(view.findAll('.not-found')).toHaveLength(0);
			expect(view.find('.value').textContent).toBe('a:Name a');
		} finally {
			view.unmount();
		}
	});

	it('passes an error thrown by a route callback to the parent error boundary', async () => {
		const onCatch = vi.fn(() => {
			throw new Error('parent owns this');
		});
		const parentOnCatch = vi.fn();
		const router = makeCompiledRouter('/items/broken', {
			renderError: true,
			onCatch,
			parentOnCatch,
		});
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			expect(view.find('.route-error').textContent).toBe('parent owns this');
			expect(view.findAll('.items-layout')).toHaveLength(0);
			expect(onCatch).toHaveBeenCalledTimes(1);
			expect(parentOnCatch).toHaveBeenCalledTimes(1);
			expect(parentOnCatch.mock.calls[0][0]).toMatchObject({ message: 'parent owns this' });
		} finally {
			view.unmount();
		}
	});

	it('keeps the global error details interactive', async () => {
		const router = makeCompiledRouter('/items/broken', { renderError: true });
		await router.load();
		router.routesById['/items/$id'].update({ errorComponent: undefined });
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			expect(view.find('strong').textContent).toBe('Something went wrong!');
			expect(view.find('code').textContent).toBe('item render failed');
			view.click('button');
			await nextPaint();
			expect(view.find('button').textContent).toBe('Show Error');
			expect(view.findAll('code')).toHaveLength(0);
			view.click('button');
			await nextPaint();
			expect(view.find('button').textContent).toBe('Hide Error');
			expect(view.find('code').textContent).toBe('item render failed');
		} finally {
			view.unmount();
		}
	});

	it('reads updated route components when its match changes', async () => {
		const router = makeCompiledRouter('/items/a', { renderError: true });
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			expect(view.find('.value').textContent).toBe('a:Name a');
			router.routesById['/items/$id'].update({
				component: router.routesById['/'].options.component,
			});
			await router.navigate({ to: '/items/b' });
			await settle();
			expect(view.findAll('.item')).toHaveLength(0);
			expect(view.find('.items-layout .go-item').textContent).toBe('Open item');
		} finally {
			view.unmount();
		}
	});

	it('fails explicitly for unsupported provider wrappers', async () => {
		const router = makeCompiledRouter('/', { wrap: true });
		await router.load();
		expect(() => mount(CompiledRouterProvider as any, { router })).toThrow(/Wrap or InnerWrap/);
	});

	it('rejects arbitrary returned values instead of silently rendering nothing', async () => {
		const router = makeCompiledRouter('/items/a', { invalid: true });
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		await settle();
		expect(view.find('.route-error').textContent).toMatch(/compiled|Compiled/);
		expect(view.find('header').textContent).toBe('Routes');
		view.unmount();
	});
});
