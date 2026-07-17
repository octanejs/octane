/**
 * Phase 1 — the public `octane/react` client shell, exercised exactly as a
 * consumer would: `import { OctaneCompat } from 'octane/react'` with plain
 * React elements as children (no test-only branding or controller hooks; the
 * Phase 0 spike suites keep the protocol-level introspection).
 *
 * Contract under test: one-component authoring shape, transported-child
 * consumption with dev validation, layout-phase publish with the §10
 * unchanged-parent-rerender bail, ref pass-through, useId stability, root
 * suspension/error escape to real React boundaries, StrictMode/hide/unmount
 * discrimination, and exact-once teardown via `reportError` fault routing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { OctaneCompat } from 'octane/react';
import { flushSync as octaneFlushSync } from '../../src/index.js';
import { createLog } from '../_helpers.js';
import { h, mountReactHost, reactAct, SpikeErrorBoundary } from './_react-host.js';
import {
	BadgeIsland,
	CleanupThrowIsland,
	GreetingIsland,
	LocallyGuardedIsland,
	NotifyIsland,
	RefIsland,
	RenderLogIsland,
	SuspendingIsland,
	ThrowingIsland,
	UseIdIsland,
} from './_fixtures/islands.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('octane/react — mount, update, unmount', () => {
	it('hosts a compiled island with live Octane state and events', async () => {
		const log = createLog();
		const mounted = await mountReactHost(
			h(
				'main',
				null,
				h(OctaneCompat, null, h(GreetingIsland as any, { name: 'world', log: log.push })),
			),
		);
		const host = mounted.host();
		expect(host.parentElement?.tagName).toBe('MAIN');
		expect(host.querySelector('.greeting')?.textContent).toBe('Hello world');
		expect(log.drain()).toEqual(['island-layout:world']);

		const button = host.querySelector('.count') as HTMLElement;
		await reactAct(async () => button.click());
		expect(button.textContent).toBe('count:1');

		await mounted.unmount();
		expect(log.drain()).toEqual(['island-cleanup:world']);
		expect(document.querySelector('[data-octane-compat]')).toBeNull();
	});

	it('publishes committed prop changes and preserves island state', async () => {
		function App(props: { name: string }) {
			return h(OctaneCompat, null, h(GreetingIsland as any, { name: props.name }));
		}
		const mounted = await mountReactHost(h(App, { name: 'one' }));
		const button = mounted.host().querySelector('.count') as HTMLElement;
		await reactAct(async () => button.click());
		expect(button.textContent).toBe('count:1');

		await mounted.render(h(App, { name: 'two' }));
		expect(mounted.host().querySelector('.greeting')?.textContent).toBe('Hello two');
		// Same island identity: the counter's Octane state survived the update.
		expect(mounted.host().querySelector('.count')?.textContent).toBe('count:1');
		await mounted.unmount();
	});

	it('skips the Octane update when a parent re-render changes nothing (§10 republish policy)', async () => {
		const log = createLog();
		let rerenderParent!: () => void;
		function App() {
			const [, bump] = React.useReducer((count: number) => count + 1, 0);
			rerenderParent = bump;
			// The transported element is recreated on every parent render, but its
			// type and shallow props are unchanged — the controller must bail
			// instead of synchronously re-rendering N islands per parent update.
			return h(OctaneCompat, null, h(RenderLogIsland as any, { label: 'fixed', log: log.push }));
		}
		const mounted = await mountReactHost(h(App));
		expect(log.drain()).toEqual(['render:fixed']);

		await reactAct(async () => rerenderParent());
		await reactAct(async () => rerenderParent());
		expect(log.drain()).toEqual([]);
		expect(mounted.host().querySelector('.render-log')?.textContent).toBe('label:fixed');

		await mounted.unmount();
	});

	it('treats the transported child key as island identity', async () => {
		// The transport is { type, props, key } (§3/§10): a key-only change must
		// replace the island (fresh state), not bail as an unchanged re-render —
		// matching what React key semantics promise the author.
		const log = createLog();
		function App(props: { islandKey: string }) {
			return h(
				OctaneCompat,
				null,
				h(GreetingIsland as any, { key: props.islandKey, name: 'keyed', log: log.push }),
			);
		}
		const mounted = await mountReactHost(h(App, { islandKey: 'a' }));
		const button = () => mounted.host().querySelector('.count') as HTMLElement;
		await reactAct(async () => button().click());
		expect(button().textContent).toBe('count:1');
		log.clear();

		// Key change, identical type + props: remount with fresh state.
		await mounted.render(h(App, { islandKey: 'b' }));
		expect(button().textContent).toBe('count:0');
		expect(log.drain()).toEqual(['island-cleanup:keyed', 'island-layout:keyed']);

		// Stable key: parent re-renders still bail (state preserved).
		await reactAct(async () => button().click());
		await mounted.render(h(App, { islandKey: 'b' }));
		expect(button().textContent).toBe('count:1');
		expect(log.drain()).toEqual([]);

		await mounted.unmount();
	});

	it('remounts the island when the transported child type changes', async () => {
		const log = createLog();
		const mounted = await mountReactHost(
			h(OctaneCompat, null, h(GreetingIsland as any, { name: 'swap', log: log.push })),
		);
		log.clear();
		await mounted.render(h(OctaneCompat, null, h(BadgeIsland as any, { label: 'fresh' })));
		expect(mounted.host().querySelector('.greeting')).toBeNull();
		expect(mounted.host().querySelector('.badge')?.textContent).toBe('badge:fresh');
		expect(log.drain()).toEqual(['island-cleanup:swap']);
		await mounted.unmount();
	});

	it('supports an Octane layout effect calling a React state setter during the hosted flush', async () => {
		function Parent() {
			const [ready, setReady] = React.useState('waiting');
			return h(
				'div',
				null,
				h('span', { className: 'ready' }, ready),
				h(OctaneCompat, null, h(NotifyIsland as any, { onReady: setReady })),
			);
		}
		const mounted = await mountReactHost(h(Parent));
		expect(mounted.container.querySelector('.ready')?.textContent).toBe('island-ready');
		await mounted.unmount();
	});

	it('passes the child ref through as an ordinary Octane ref prop', async () => {
		const refTargets: (Element | null)[] = [];
		const mounted = await mountReactHost(
			h(
				OctaneCompat,
				null,
				h(RefIsland as any, { ref: (element: Element | null) => refTargets.push(element) }),
			),
		);
		expect(refTargets).toHaveLength(1);
		expect(refTargets[0]).toBe(mounted.host().querySelector('.ref-island'));
		await mounted.unmount();
		expect(refTargets).toEqual([expect.any(Element), null]);
	});

	it('gives each island a distinct, republish-stable Octane useId space', async () => {
		function App(props: { epoch: number }) {
			return h(
				'div',
				null,
				h('span', { className: 'epoch' }, String(props.epoch)),
				h(OctaneCompat, { key: 'a' } as any, h(UseIdIsland as any)),
				h(OctaneCompat, { key: 'b' } as any, h(UseIdIsland as any)),
			);
		}
		const mounted = await mountReactHost(h(App, { epoch: 0 }));
		const idsOf = () =>
			[...mounted.container.querySelectorAll('.use-id')].map((node) =>
				node.getAttribute('data-oid'),
			);
		const initial = idsOf();
		expect(initial).toHaveLength(2);
		expect(initial[0]).not.toBe(initial[1]);

		// Identifier stability across a parent re-render/republish: the hosted
		// root (and its id state) is reused, never recreated. (Server/client
		// prefix PARITY is the Phase 4 SSR contract.)
		await mounted.render(h(App, { epoch: 1 }));
		expect(mounted.container.querySelector('.epoch')?.textContent).toBe('1');
		expect(idsOf()).toEqual(initial);
		await mounted.unmount();
	});
});

describe('octane/react — dev validation of the transported child (§3)', () => {
	let quietConsoleError: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		quietConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => quietConsoleError.mockRestore());

	async function rejectionMessage(children: React.ReactNode): Promise<string> {
		let caught: unknown = null;
		const mounted = await mountReactHost(
			h(
				SpikeErrorBoundary,
				{
					fallback: (error: unknown) => {
						caught = error;
						return h('p', { className: 'rejected' }, 'rejected');
					},
				} as any,
				h(OctaneCompat, null, children),
			),
		);
		expect(mounted.container.querySelector('.rejected')).not.toBeNull();
		await mounted.unmount();
		return (caught as Error).message;
	}

	it('rejects host elements, Fragments, plain renderables, and multiple children', async () => {
		expect(await rejectionMessage(h('div', null, 'raw'))).toMatch(/DOM element <div>/);
		expect(await rejectionMessage(h(React.Fragment, null, h('p')))).toMatch(/Fragment/);
		expect(await rejectionMessage('text child')).toMatch(/plain renderable/);
		expect(
			await rejectionMessage([
				h(BadgeIsland as any, { label: 'a', key: 'a' }),
				h(BadgeIsland as any, { label: 'b', key: 'b' }),
			]),
		).toMatch(/exactly one Octane component element/);
	});

	it('rejects React-only element types: memo/forwardRef wrappers and class components', async () => {
		const Memoized = React.memo(function Memoized() {
			return h('p', null, 'memo');
		});
		expect(await rejectionMessage(h(Memoized))).toMatch(/exotic React element/);

		class ClassComponent extends React.Component {
			render(): React.ReactNode {
				return h('p', null, 'class');
			}
		}
		expect(await rejectionMessage(h(ClassComponent))).toMatch(/class components are React-only/);
	});
});

describe('octane/react — suspension and error escape to React boundaries', () => {
	it('escapes an unhandled island suspension to the nearest React Suspense boundary', async () => {
		const resource = deferred<string>();
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(OctaneCompat, null, h(SuspendingIsland as any, { resource: resource.promise })),
			),
		);
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();

		await reactAct(async () => {
			resource.resolve('data');
			await resource.promise;
		});
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(mounted.host().querySelector('.resolved')?.textContent).toBe('value:data');
		await mounted.unmount();
	});

	it('lets a local Octane boundary win without involving React', async () => {
		const resource = deferred<string>();
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(OctaneCompat, null, h(LocallyGuardedIsland as any, { resource: resource.promise })),
			),
		);
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(mounted.host().querySelector('.local-pending')?.textContent).toBe('local pending');

		await reactAct(async () => {
			resource.resolve('inner');
			await resource.promise;
			octaneFlushSync(() => {});
		});
		expect(mounted.host().querySelector('.resolved')?.textContent).toBe('value:inner');
		await mounted.unmount();
	});

	it('throws an unhandled island error into the nearest React error boundary and recovers on reset', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const boundaryRef = React.createRef<SpikeErrorBoundary>();
			function App(props: { fail: boolean }) {
				return h(
					SpikeErrorBoundary,
					{
						ref: boundaryRef,
						fallback: (error: unknown) =>
							h('p', { className: 'react-caught' }, `caught:${(error as Error).message}`),
					} as any,
					h(OctaneCompat, null, h(ThrowingIsland as any, { fail: props.fail })),
				);
			}
			const mounted = await mountReactHost(h(App, { fail: true }));
			expect(mounted.container.querySelector('.react-caught')?.textContent).toBe(
				'caught:island exploded',
			);

			// React ownership of reset: the boundary retry mounts a fresh wrapper,
			// which binds a fresh hosted root (§5 rule 9).
			await mounted.render(h(App, { fail: false }));
			await reactAct(async () => boundaryRef.current!.reset());
			expect(mounted.container.querySelector('.react-caught')).toBeNull();
			expect(mounted.host().querySelector('.ok')?.textContent).toBe('ok');
			await mounted.unmount();
		} finally {
			quiet.mockRestore();
		}
	});

	it('ignores a late settlement after the island unmounted while pending', async () => {
		const resource = deferred<string>();
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(OctaneCompat, null, h(SuspendingIsland as any, { resource: resource.promise })),
			),
		);
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();
		await mounted.unmount();

		await reactAct(async () => {
			resource.resolve('too late');
			await resource.promise;
		});
		expect(document.querySelector('[data-octane-compat]')).toBeNull();
		expect(document.querySelector('.resolved')).toBeNull();
	});
});

describe('octane/react — StrictMode, hide/reveal, and teardown discrimination (§5 rule 7)', () => {
	it('survives the StrictMode development probe and still disposes exactly once at unmount', async () => {
		const log = createLog();
		const mounted = await mountReactHost(
			h(
				React.StrictMode,
				null,
				h(OctaneCompat, null, h(GreetingIsland as any, { name: 'strict', log: log.push })),
			),
		);
		// The probe never tore the island down.
		expect(log.entries.filter((entry) => entry.startsWith('island-cleanup'))).toEqual([]);
		const button = mounted.host().querySelector('.count') as HTMLElement;
		await reactAct(async () => button.click());
		expect(button.textContent).toBe('count:1');

		await mounted.unmount();
		expect(log.entries.filter((entry) => entry.startsWith('island-cleanup'))).toEqual([
			'island-cleanup:strict',
		]);
	});

	it('preserves the island across a Suspense hide and reattaches on reveal', async () => {
		const log = createLog();
		const gate = deferred<void>();
		let setSuspended!: (value: boolean) => void;
		function Sibling() {
			const [suspended, set] = React.useState(false);
			setSuspended = set;
			if (suspended) React.use(gate.promise);
			return null;
		}
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(OctaneCompat, null, h(GreetingIsland as any, { name: 'hide', log: log.push })),
				h(Sibling),
			),
		);
		const host = mounted.host();
		await reactAct(async () => (host.querySelector('.count') as HTMLElement).click());
		log.clear();

		await reactAct(async () => setSuspended(true));
		expect(host.isConnected).toBe(true);
		expect(host.style.display).toBe('none');
		// Hidden, not unmounted: Octane DOM, state, and effects all kept.
		expect(host.querySelector('.count')?.textContent).toBe('count:1');
		expect(log.drain()).toEqual([]);

		await reactAct(async () => {
			gate.resolve();
			await gate.promise;
		});
		expect(host.style.display).not.toBe('none');
		await reactAct(async () => (host.querySelector('.count') as HTMLElement).click());
		expect(host.querySelector('.count')?.textContent).toBe('count:2');

		await mounted.unmount();
		expect(log.drain()).toEqual(['island-cleanup:hide']);
	});

	it('disposes exactly once when React deletes an island that is currently hidden', async () => {
		const log = createLog();
		const gate = deferred<void>();
		let setSuspended!: (value: boolean) => void;
		function Sibling() {
			const [suspended, set] = React.useState(false);
			setSuspended = set;
			if (suspended) React.use(gate.promise);
			return null;
		}
		const mounted = await mountReactHost(
			h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(OctaneCompat, null, h(GreetingIsland as any, { name: 'hidden-del', log: log.push })),
				h(Sibling),
			),
		);
		await reactAct(async () => setSuspended(true));
		log.clear();

		await mounted.unmount();
		expect(log.drain()).toEqual(['island-cleanup:hidden-del']);
	});

	it('routes a hosted cleanup fault through reportError without scheduling the dead wrapper', async () => {
		// jsdom does not implement reportError; stub the global the module
		// feature-detects (browsers and Node both provide it).
		const reported: unknown[] = [];
		vi.stubGlobal('reportError', (error: unknown) => {
			reported.push(error);
		});
		try {
			const mounted = await mountReactHost(h(OctaneCompat, null, h(CleanupThrowIsland as any, {})));
			expect(mounted.host().querySelector('.cleanup-throw')?.textContent).toBe('armed');
			await mounted.unmount();
			expect(reported).toHaveLength(1);
			expect((reported[0] as Error).message).toBe('island cleanup exploded');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
