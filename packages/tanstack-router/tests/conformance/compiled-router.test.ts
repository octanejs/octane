import { describe, expect, it } from 'vitest';
import { CompiledRouterProvider } from '@octanejs/tanstack-router/compiled';
import { mount, nextPaint } from '../_helpers';
import { makeCompiledRouter, makeCompiledFileRouter } from '../_fixtures/compiled-router.tsrx';

async function settle() {
	for (let i = 0; i < 6; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}

describe('opt-in compiled router rendering', () => {
	it('commits the Link transition cue before synchronous router callbacks', async () => {
		const router = makeCompiledFileRouter();
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		try {
			await settle();
			const link = view.find('.file-timing') as HTMLAnchorElement;
			const observations: unknown[] = [];
			const unsubscribe = router.subscribe('onBeforeNavigate', () => {
				observations.push([link.getAttribute('data-transitioning'), link.textContent]);
			});
			link.click();
			expect(observations).toEqual([['transitioning', 'true']]);
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

	it('renders lazy nested outlets, keeps parent identity and owns hooks and history', async () => {
		const router = makeCompiledRouter();
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		await settle();
		const header = view.find('header');
		expect(header.getAttribute('data-selected')).toBe('/');
		const events: string[] = [];
		const unsubs = ['onLoad', 'onResolved', 'onRendered'].map((event) =>
			router.subscribe(event as any, () => events.push(event)),
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
		expect(events).toContain('onLoad');
		expect(events).toContain('onResolved');
		expect(events).toContain('onRendered');

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

	it('shows route errors inside the compiled layout', async () => {
		const router = makeCompiledRouter('/items/a', { rejected: true });
		await router.load();
		const view = mount(CompiledRouterProvider as any, { router });
		await settle();
		expect(view.find('.route-error').textContent).toBe('item failed');
		expect(view.find('header').textContent).toBe('Routes');
		view.unmount();
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
