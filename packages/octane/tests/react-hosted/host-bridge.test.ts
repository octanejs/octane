/**
 * Phase 0 spike — React 19 hosting an unmodified compiled Octane root through
 * the existing RendererRegionOwnerBridge protocol
 * (docs/react-hosted-octane-compat-plan.md §5–§7, §14 Phase 0).
 *
 * Exit-gate coverage: context bootstrap + real React subscription, root
 * suspension/error escape to real React boundaries with post-commit relay
 * resolution, local-Octane-boundary priority, ownership, and teardown.
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { flushSync as octaneFlushSync } from '../../src/index.js';
import { createLog } from '../_helpers.js';
import {
	h,
	octaneChild,
	mountReactHost,
	reactAct,
	IslandController,
	OctaneCompatSpike,
	SpikeErrorBoundary,
} from './_react-host.js';
import {
	BadgeIsland,
	ChainedIsland,
	GreetingIsland,
	LocallyGuardedIsland,
	MemoThemedIsland,
	NotifyIsland,
	SuspendingIsland,
	ThemedIsland,
	ThrowingIsland,
	TwoContextIsland,
} from './_fixtures/islands.tsrx';
import { MirrorLocale, MirrorTheme } from './_fixtures/mirror-context.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('react-hosted island — ownership and lifecycle', () => {
	it('mounts an unmodified compiled island under a React-owned host with live Octane events', async () => {
		const log = createLog();
		const mounted = await mountReactHost(
			h(
				'main',
				null,
				h(OctaneCompatSpike, null, octaneChild(GreetingIsland, { name: 'world', log: log.push })),
			),
		);

		const host = mounted.host();
		expect(host.parentElement?.tagName).toBe('MAIN');
		expect(host.querySelector('.greeting')?.textContent).toBe('Hello world');
		expect(log.drain()).toEqual(['island-layout:world']);

		// Octane events are native + delegated at the island host — React never sees them.
		const button = host.querySelector('.count') as HTMLElement;
		expect(button.textContent).toBe('count:0');
		await reactAct(async () => button.click());
		expect(button.textContent).toBe('count:1');

		await mounted.unmount();
		expect(log.drain()).toEqual(['island-cleanup:world']);
	});

	it('publishes React-committed props updates to the island in the layout phase', async () => {
		const log = createLog();
		function App(props: { name: string }) {
			return h(
				OctaneCompatSpike,
				null,
				octaneChild(GreetingIsland, { name: props.name, log: log.push }),
			);
		}
		const mounted = await mountReactHost(h(App, { name: 'one' }));
		expect(mounted.host().querySelector('.greeting')?.textContent).toBe('Hello one');
		log.clear();

		await mounted.render(h(App, { name: 'two' }));
		expect(mounted.host().querySelector('.greeting')?.textContent).toBe('Hello two');
		// Same island identity: Octane updated in place (effect re-ran for the new
		// name, but the island was not remounted).
		expect(log.drain()).toEqual(['island-cleanup:one', 'island-layout:two']);

		await mounted.unmount();
	});

	it('replaces the island component when the transported child type changes', async () => {
		const log = createLog();
		const mounted = await mountReactHost(
			h(OctaneCompatSpike, null, octaneChild(GreetingIsland, { name: 'swap', log: log.push })),
		);
		expect(mounted.host().querySelector('.greeting')).not.toBeNull();
		log.clear();

		await mounted.render(h(OctaneCompatSpike, null, octaneChild(BadgeIsland, { label: 'fresh' })));
		expect(mounted.host().querySelector('.greeting')).toBeNull();
		expect(mounted.host().querySelector('.badge')?.textContent).toBe('badge:fresh');
		expect(log.drain()).toEqual(['island-cleanup:swap']);

		await mounted.unmount();
	});

	it('lets a parent React layout effect observe the committed Octane DOM', async () => {
		// React layout setup is child-before-ancestor: the wrapper's layout effect
		// synchronously finishes the hosted Octane commit (§5 rule 4), so an outer
		// layout effect must see current island DOM, not a queued microtask update.
		let observed: string | null | undefined;
		function Probe(props: { children?: React.ReactNode }) {
			React.useLayoutEffect(() => {
				observed = document.querySelector('[data-octane-compat] .greeting')?.textContent;
			}, []);
			return props.children;
		}
		const mounted = await mountReactHost(
			h(Probe, null, h(OctaneCompatSpike, null, octaneChild(GreetingIsland, { name: 'sync' }))),
		);
		expect(observed).toBe('Hello sync');
		await mounted.unmount();
	});

	it('supports an Octane layout effect calling a React state setter during the hosted flush', async () => {
		// Re-entrancy is legal for React layout effects; the hosted synchronous
		// flush inside React's commit phase inherits that contract (§13).
		function Parent() {
			const [ready, setReady] = React.useState('waiting');
			return h(
				'div',
				null,
				h('span', { className: 'ready' }, ready),
				h(OctaneCompatSpike, null, octaneChild(NotifyIsland, { onReady: setReady })),
			);
		}
		const mounted = await mountReactHost(h(Parent));
		expect(mounted.container.querySelector('.ready')?.textContent).toBe('island-ready');
		await mounted.unmount();
	});

	it('tolerates external removal of the Octane-owned DOM before React unmounts', async () => {
		const mounted = await mountReactHost(
			h(OctaneCompatSpike, null, octaneChild(BadgeIsland, { label: 'gone' })),
		);
		// Externally rip out the Octane-owned descendants (the host element itself
		// stays React-owned): octane's safe-cleanup guarantee must hold for the
		// hosted root when React later tears everything down.
		mounted.host().replaceChildren();
		expect(mounted.host().innerHTML).toBe('');
		await expect(mounted.unmount()).resolves.toBeUndefined();
	});
});

describe('react-hosted island — transparent context via the owner bridge', () => {
	const ThemeCtx = React.createContext('unset-theme');
	const LocaleCtx = React.createContext('unset-locale');
	const themePair = { react: ThemeCtx as React.Context<any>, mirror: MirrorTheme };
	const localePair = { react: LocaleCtx as React.Context<any>, mirror: MirrorLocale };

	it('bootstraps the committed provider value and stays live through provider-only updates across a memoized parent', async () => {
		let bridgeRenders = 0;
		const Bridge = React.memo(function Bridge(props: { children?: React.ReactNode }) {
			bridgeRenders++;
			return props.children;
		});
		let setTheme!: (value: string) => void;
		// The island element is created ONCE so parent re-renders hand the memo
		// bridge identical children — only React context propagation can reach the
		// wrapper. A Fiber-read-only strategy would strand the island here (§16).
		const islandElement = h(
			OctaneCompatSpike,
			{ contexts: [themePair] },
			octaneChild(ThemedIsland),
		);
		function App() {
			const [theme, set] = React.useState('dark');
			setTheme = set;
			return h(ThemeCtx, { value: theme } as any, h(Bridge, null, islandElement));
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.host().querySelector('.themed')?.textContent).toBe('theme:dark');
		expect(bridgeRenders).toBe(1);

		await reactAct(async () => setTheme('light'));
		expect(mounted.host().querySelector('.themed')?.textContent).toBe('theme:light');
		expect(bridgeRenders).toBe(1);

		await reactAct(async () => setTheme('solar'));
		expect(mounted.host().querySelector('.themed')?.textContent).toBe('theme:solar');

		await mounted.unmount();
	});

	it('invalidates a memoized Octane consumer through the mirror version bump', async () => {
		// The memo() leaf has no props: only the committed snapshot publish
		// (§6.2 step 9 — mirror.$$version bump before the synchronous flush) can
		// force it past its bailout.
		let setTheme!: (value: string) => void;
		function App() {
			const [theme, set] = React.useState('start');
			setTheme = set;
			return h(
				ThemeCtx,
				{ value: theme } as any,
				h(OctaneCompatSpike, { contexts: [themePair] }, octaneChild(MemoThemedIsland)),
			);
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.host().querySelector('.memo-themed')?.textContent).toBe('memo-theme:start');

		await reactAct(async () => setTheme('bumped'));
		expect(mounted.host().querySelector('.memo-themed')?.textContent).toBe('memo-theme:bumped');

		await mounted.unmount();
	});

	it('registers several contexts read in one island render and keeps each live', async () => {
		let controller: IslandController | null = null;
		let setTheme!: (value: string) => void;
		let setLocale!: (value: string) => void;
		function App() {
			const [theme, updateTheme] = React.useState('t0');
			const [locale, updateLocale] = React.useState('l0');
			setTheme = updateTheme;
			setLocale = updateLocale;
			return h(
				ThemeCtx,
				{ value: theme } as any,
				h(
					LocaleCtx,
					{ value: locale } as any,
					h(
						OctaneCompatSpike,
						{
							contexts: [themePair, localePair],
							controllerRef: (instance) => {
								controller = instance;
							},
						},
						octaneChild(TwoContextIsland),
					),
				),
			);
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.host().querySelector('.two-ctx')?.textContent).toBe('theme:t0 locale:l0');
		expect(controller!.entries).toHaveLength(2);

		await reactAct(async () => setLocale('l1'));
		expect(mounted.host().querySelector('.two-ctx')?.textContent).toBe('theme:t0 locale:l1');
		await reactAct(async () => setTheme('t1'));
		expect(mounted.host().querySelector('.two-ctx')?.textContent).toBe('theme:t1 locale:l1');

		await mounted.unmount();
	});

	it('returns the mirror default when no pairing exists for the read context', async () => {
		const mounted = await mountReactHost(h(OctaneCompatSpike, null, octaneChild(ThemedIsland)));
		expect(mounted.host().querySelector('.themed')?.textContent).toBe('theme:mirror-default-theme');
		await mounted.unmount();
	});
});

describe('react-hosted island — suspension and error escape', () => {
	it('escapes an unhandled initial suspension to the nearest React Suspense boundary and reveals only after the Octane retry commits', async () => {
		const resource = deferred<string>();
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(OctaneCompatSpike, null, octaneChild(SuspendingIsland, { resource: resource.promise })),
			),
		);

		expect(mounted.container.querySelector('.react-fallback')?.textContent).toBe('react pending');
		// React hides (not unmounts) the committed host while suspended.
		const host = mounted.host();
		expect(host.isConnected).toBe(true);
		expect((host as HTMLElement).style.display).toBe('none');

		await reactAct(async () => {
			resource.resolve('data');
			await resource.promise;
		});
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(mounted.host().style.display).not.toBe('none');
		expect(mounted.host().querySelector('.resolved')?.textContent).toBe('value:data');

		await mounted.unmount();
	});

	it('keeps one React fallback up across sequential dependent suspensions', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(
					OctaneCompatSpike,
					null,
					octaneChild(ChainedIsland, { first: first.promise, second: second.promise }),
				),
			),
		);
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();

		await reactAct(async () => {
			first.resolve('a');
			await first.promise;
		});
		// The retry re-suspended on the second dependency: same episode, fallback stays.
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();

		await reactAct(async () => {
			second.resolve('b');
			await second.promise;
		});
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(mounted.host().querySelector('.chained')?.textContent).toBe('a+b');

		await mounted.unmount();
	});

	it('routes a rejected root suspension to the nearest React error boundary', async () => {
		const resource = deferred<string>();
		const boundaryRef = React.createRef<SpikeErrorBoundary>();
		const mounted = await mountReactHost(
			h(
				SpikeErrorBoundary,
				{
					ref: boundaryRef,
					fallback: (error: unknown) =>
						h('p', { className: 'react-caught' }, `caught:${(error as Error).message}`),
				} as any,
				h(
					React.Suspense,
					{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
					h(OctaneCompatSpike, null, octaneChild(SuspendingIsland, { resource: resource.promise })),
				),
			),
		);
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();

		await reactAct(async () => {
			resource.reject(new Error('fetch failed'));
			await resource.promise.catch(() => {});
		});
		expect(mounted.container.querySelector('.react-caught')?.textContent).toBe(
			'caught:fetch failed',
		);

		await mounted.unmount();
	});

	it('lets a local Octane boundary win without notifying React', async () => {
		const resource = deferred<string>();
		let controller: IslandController | null = null;
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(
					OctaneCompatSpike,
					{
						controllerRef: (instance) => {
							controller = instance;
						},
					},
					octaneChild(LocallyGuardedIsland, { resource: resource.promise }),
				),
			),
		);
		// The island's own @pending arm rendered; React saw nothing.
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(mounted.host().querySelector('.local-pending')?.textContent).toBe('local pending');
		expect(controller!.status).toBe(0);

		await reactAct(async () => {
			resource.resolve('inner');
			await resource.promise;
			octaneFlushSync(() => {});
		});
		expect(mounted.host().querySelector('.resolved')?.textContent).toBe('value:inner');
		expect(controller!.status).toBe(0);

		await mounted.unmount();
	});

	it('throws an unhandled island error into the nearest React error boundary and recovers on reset', async () => {
		const boundaryRef = React.createRef<SpikeErrorBoundary>();
		function App(props: { fail: boolean }) {
			return h(
				SpikeErrorBoundary,
				{
					ref: boundaryRef,
					fallback: (error: unknown) =>
						h('p', { className: 'react-caught' }, `caught:${(error as Error).message}`),
				} as any,
				h(OctaneCompatSpike, null, octaneChild(ThrowingIsland, { fail: props.fail })),
			);
		}
		const mounted = await mountReactHost(h(App, { fail: true }));
		expect(mounted.container.querySelector('.react-caught')?.textContent).toBe(
			'caught:island exploded',
		);
		expect(mounted.container.querySelector('[data-octane-compat]')).toBeNull();

		// React ownership of reset: the boundary retry mounts a fresh wrapper,
		// which safely creates and binds a fresh hosted root (§5 rule 9).
		await mounted.render(h(App, { fail: false }));
		await reactAct(async () => boundaryRef.current!.reset());
		expect(mounted.container.querySelector('.react-caught')).toBeNull();
		expect(mounted.host().querySelector('.ok')?.textContent).toBe('ok');

		await mounted.unmount();
	});

	it('ignores a late settlement after the island unmounted while pending', async () => {
		const resource = deferred<string>();
		let controller: IslandController | null = null;
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(
					OctaneCompatSpike,
					{
						controllerRef: (instance) => {
							controller = instance;
						},
					},
					octaneChild(SuspendingIsland, { resource: resource.promise }),
				),
			),
		);
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();

		await mounted.unmount();
		expect(controller!.isDisposed).toBe(true);

		// The wakeable settles after teardown: it must not recreate the root.
		await reactAct(async () => {
			resource.resolve('too late');
			await resource.promise;
		});
		expect(controller!.hasLiveRoot).toBe(false);
		expect(document.querySelector('[data-octane-compat]')).toBeNull();
	});
});
