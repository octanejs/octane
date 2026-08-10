import { describe, it, expect } from 'vitest';
import { createElement, flushSync, Suspense, use } from 'octane';
import { flushEffects, mount, nextPaint } from '../_helpers';
import { Asset, RouterProvider, routerContext } from '@octanejs/tanstack-router';
import { usePrevious } from '../../src/utils';
import { useStore } from '../../src/useStore';
import { makeHooksRouter, navigateIdentities } from '../_fixtures/hooks.tsrx';
import { ManagedHeadOwners, makeSsrRouter } from '../_fixtures/ssr.tsrx';
import type { AnyRouter } from '@tanstack/router-core';

async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

// Hook parity — per react-router's useMatch.tsx (nearest-match via matchContext,
// strict params), route.tsx (Route/getRouteApi hook accessors), useLoaderDeps,
// useRouteContext, Matches.tsx (useParentMatches/useChildMatches), useNavigate
// (stable identity), useCanGoBack.
describe('@octanejs/tanstack-router — hooks', () => {
	it('a LAYOUT with no `from` resolves the NEAREST match, not the leaf', async () => {
		const router = makeHooksRouter('/items/i7?tab=specs');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		// Strict params at the layout level: the layout route defines no params,
		// so its own (nearest) match yields {} — NOT the leaf's { id: 'i7' }.
		expect(r.find('.layout-params').textContent).toBe('{}');
		expect(r.find('.layout-route').textContent).toBe('/items');
		// The leaf still sees its own params.
		expect(r.find('.item-params').textContent).toBe('{"id":"i7"}');
		r.unmount();
	});

	it('Route.useLoaderData / useLoaderDeps / useRouteContext read the match', async () => {
		const router = makeHooksRouter('/items/i7?tab=specs');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		expect(r.find('.item-loader').textContent).toBe('loaded-i7');
		expect(r.find('.item-deps').textContent).toBe('{"tab":"specs"}');
		expect(r.find('.item-context').textContent).toBe('ctx-value');
		r.unmount();
	});

	it('useMatches / useParentMatches / useChildMatches slice the match chain', async () => {
		const router = makeHooksRouter('/items/i7');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		// Chain: __root__ > /items > /items/$id — the leaf sees 3 matches, 2
		// parents, 0 children.
		expect(r.find('.item-counts').textContent).toBe('3/2/0');
		r.unmount();
	});

	it('getRouteApi(id) hooks read the route match by id', async () => {
		const router = makeHooksRouter('/items/summary/i9');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();

		expect(r.find('.api-summary').textContent).toBe('sum-i9:i9');
		r.unmount();
	});

	it('useCanGoBack is false on the first entry and true after navigating', async () => {
		const router = makeHooksRouter('/');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(r.find('.can-go-back').textContent).toBe('false');

		await router.navigate({ to: '/items/i7' });
		await flush();
		await router.navigate({ to: '/' });
		await flush();
		expect(r.find('.can-go-back').textContent).toBe('true');
		r.unmount();
	});

	it('useNavigate returns a stable function across re-renders', async () => {
		const router = makeHooksRouter('/search?q=a');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(r.find('.search').textContent).toBe('{"q":"a"}');

		// Same-route search change re-renders SearchPage.
		await router.navigate({ to: '/search', search: { q: 'b' } });
		await flush();
		expect(r.find('.search').textContent).toBe('{"q":"b"}');

		expect(navigateIdentities.length).toBeGreaterThanOrEqual(2);
		const first = navigateIdentities[0];
		expect(navigateIdentities.every((f) => f === first)).toBe(true);
		r.unmount();
	});

	it('validateSearch runs (defaults applied) — search middleware path', async () => {
		const router = makeHooksRouter('/search');
		await router.load();
		const r = mount(RouterProvider as any, { router });
		await flush();
		expect(r.find('.search').textContent).toBe('{"q":""}');
		r.unmount();
	});
});

describe('@octanejs/tanstack-router — document asset ownership', () => {
	it("keeps each head manager's metadata alive until that manager unmounts", async () => {
		const router = makeSsrRouter();
		router.isServer = false;
		await router.load();
		const result = mount(ManagedHeadOwners, { router, secondary: true });
		const selector = 'meta[name="description"][content="Rendered by Octane"]';

		try {
			const initial = Array.from(document.head.querySelectorAll(selector));
			expect(initial).toHaveLength(2);
			const retained = initial[0];

			result.update(ManagedHeadOwners, { router, secondary: false });
			expect(document.head.querySelectorAll(selector)).toHaveLength(1);
			expect(document.head.querySelector(selector)).toBe(retained);
		} finally {
			result.unmount();
		}

		expect(document.head.querySelector(selector)).toBeNull();
	});

	it('adopts and cleans up a public Asset using its original asset key', async () => {
		const router = makeSsrRouter();
		router.isServer = false;
		await router.load();
		const existing = document.createElement('meta');
		existing.setAttribute('name', 'legacy-router-asset');
		existing.setAttribute('data-tsr-managed-key', 'legacy:public-asset');
		document.head.appendChild(existing);

		function PublicAssetOwner(props: { router: AnyRouter }) {
			return createElement(routerContext.Provider, {
				value: props.router,
				children: createElement(Asset, {
					tag: 'meta',
					attrs: { name: 'legacy-router-asset' },
					assetKey: 'legacy:public-asset',
					target: 'head',
				}),
			});
		}

		const result = mount(PublicAssetOwner, { router });
		try {
			expect(document.head.querySelector('meta[name="legacy-router-asset"]')).toBe(existing);
		} finally {
			result.unmount();
		}
		expect(document.head.querySelector('meta[name="legacy-router-asset"]')).toBeNull();
	});

	it('adopts an existing nonce-protected body script without replacing or duplicating it', async () => {
		const router = makeSsrRouter();
		router.isServer = false;
		await router.load();
		const existing = document.createElement('script');
		existing.id = 'legacy-router-body-script';
		existing.nonce = 'octane-csp';
		existing.textContent = 'globalThis.__octaneRouterAsset = true';
		existing.setAttribute('data-tsr-managed-key', 'legacy:body-script');
		document.body.appendChild(existing);

		function PublicBodyAssetOwner(props: { router: AnyRouter }) {
			return createElement(routerContext.Provider, {
				value: props.router,
				children: createElement(Asset, {
					tag: 'script',
					attrs: { id: 'legacy-router-body-script', nonce: 'octane-csp' },
					children: 'globalThis.__octaneRouterAsset = true',
					assetKey: 'legacy:body-script',
					target: 'body',
				}),
			});
		}

		const result = mount(PublicBodyAssetOwner, { router });
		try {
			expect(document.body.querySelectorAll('#legacy-router-body-script')).toHaveLength(1);
			expect(document.body.querySelector('#legacy-router-body-script')).toBe(existing);
			expect(existing.nonce).toBe('octane-csp');
		} finally {
			result.unmount();
		}
		expect(document.body.querySelector('#legacy-router-body-script')).toBeNull();
	});
});

describe('@octanejs/tanstack-router — store selection', () => {
	it('retains custom equality on reactive client stores and publishes changed selections', () => {
		let current = { label: 'first', version: 0 };
		const listeners = new Set<() => void>();
		const store = {
			get: () => current,
			subscribe: (listener: () => void) => {
				listeners.add(listener);
				return { unsubscribe: () => listeners.delete(listener) };
			},
		};
		const slot = Symbol('router-selected-store');
		const selections: Array<{ label: string }> = [];

		function SelectedValue() {
			const selected = useStore(
				store,
				(value) => ({ label: value.label }),
				(previous, next) => previous.label === next.label,
				slot,
			);
			selections.push(selected);
			return createElement('output', { 'data-testid': 'selected-router-store' }, selected.label);
		}

		const result = mount(SelectedValue);
		try {
			flushEffects();
			expect(listeners.size).toBe(1);
			const initial = result.find('[data-testid="selected-router-store"]');
			const selected = selections[selections.length - 1];
			flushSync(() => {
				current = { label: 'first', version: 1 };
				for (const listener of listeners) listener();
			});
			expect(result.find('[data-testid="selected-router-store"]')).toBe(initial);
			expect(selections[selections.length - 1]).toBe(selected);

			flushSync(() => {
				current = { label: 'second', version: 2 };
				for (const listener of listeners) listener();
			});
			expect(result.find('[data-testid="selected-router-store"]').textContent).toBe('second');
		} finally {
			result.unmount();
		}
		flushEffects();
		expect(listeners.size).toBe(0);
	});
});

interface PreviousRouterValueProps {
	value: string | number;
	resource?: Promise<void> | null;
}

const PREVIOUS_ROUTER_VALUE_SLOT = Symbol('router-previous-value');

function PreviousRouterValue(props: PreviousRouterValueProps) {
	const previous = usePrevious(props.value, PREVIOUS_ROUTER_VALUE_SLOT);
	if (props.resource != null) use(props.resource);
	return createElement('output', { 'data-testid': 'previous-value' }, previous ?? 'initial');
}

function PreviousRouterValueBoundary(props: PreviousRouterValueProps) {
	return createElement(
		Suspense,
		{ fallback: createElement('output', { 'data-testid': 'pending' }, 'pending') },
		createElement(PreviousRouterValue, props),
	);
}

describe('@octanejs/tanstack-router — previous distinct value', () => {
	it('starts empty and retains the previous distinct committed value', () => {
		const result = mount(PreviousRouterValueBoundary, { value: 'first' });
		try {
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('initial');

			result.update(PreviousRouterValueBoundary, { value: 'second' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('first');

			result.update(PreviousRouterValueBoundary, { value: 'second' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('first');

			result.update(PreviousRouterValueBoundary, { value: 'third' });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('second');
		} finally {
			result.unmount();
		}
	});

	it('does not treat positive and negative zero as distinct values', () => {
		const result = mount(PreviousRouterValueBoundary, { value: 0 });
		try {
			result.update(PreviousRouterValueBoundary, { value: -0 });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('initial');
		} finally {
			result.unmount();
		}
	});

	it('does not publish previous-value history from an abandoned Suspense render', () => {
		const pending = new Promise<void>(() => {});
		const result = mount(PreviousRouterValueBoundary, { value: 'committed' });
		try {
			result.update(PreviousRouterValueBoundary, { value: 'abandoned', resource: pending });
			result.update(PreviousRouterValueBoundary, { value: 'replacement', resource: null });
			expect(result.find('[data-testid="previous-value"]').textContent).toBe('committed');
		} finally {
			result.unmount();
		}
	});
});
