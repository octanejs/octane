/**
 * Phase 3 completion — the §13 failure-matrix breadth through the public
 * `octane/react` surface (react-hosted-octane-compat-plan.md §7, §14 Phase 3):
 * commit-phase fault routing (layout/passive/ref), update suspensions over
 * committed content, and transition-originated episodes.
 *
 * The §7 supersession decision (open question 16) pinned here: context/prop
 * snapshots that change during a pending episode publish at REVEAL time — the
 * suspended wrapper re-renders with fresh values but keeps throwing the same
 * relay; when the Octane retry commits, the wrapper completes and its layout
 * publish supersedes the episode-start snapshot before paint.
 */
import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { OctaneCompat } from 'octane/react';
import { drainPassiveEffects } from '../../src/index.js';
import { h, mountReactHost, reactAct, SpikeErrorBoundary } from './_react-host.js';
import { EffectFaultIsland, RefIsland, StatefulSuspendingIsland } from './_fixtures/islands.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function caughtBoundary(children: React.ReactNode, sink: { message: string | null }) {
	return h(
		SpikeErrorBoundary,
		{
			fallback: (error: unknown) => {
				sink.message = (error as Error).message;
				return h('p', { className: 'react-caught' }, 'caught');
			},
		} as any,
		children,
	);
}

describe('octane/react — commit-phase fault routing (§13)', () => {
	it('routes an island layout-effect SETUP fault to the React error boundary', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const sink = { message: null as string | null };
			function App(props: { boom: boolean }) {
				return caughtBoundary(
					h(
						OctaneCompat,
						null,
						h(EffectFaultIsland as any, { label: 'layout', layoutBoom: props.boom }),
					),
					sink,
				);
			}
			const mounted = await mountReactHost(h(App, { boom: false }));
			expect(mounted.host().querySelector('.effect-fault')).not.toBeNull();

			await mounted.render(h(App, { boom: true }));
			expect(sink.message).toBe('island layout setup exploded');
			expect(mounted.container.querySelector('.react-caught')).not.toBeNull();
			await mounted.unmount();
		} finally {
			quiet.mockRestore();
		}
	});

	it('routes an island passive-effect SETUP fault to the React error boundary', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const sink = { message: null as string | null };
			function App(props: { boom: boolean }) {
				return caughtBoundary(
					h(
						OctaneCompat,
						null,
						h(EffectFaultIsland as any, { label: 'passive', passiveBoom: props.boom }),
					),
					sink,
				);
			}
			const mounted = await mountReactHost(h(App, { boom: false }));
			await mounted.render(h(App, { boom: true }));
			// Passive effects run post-paint; drain them so the fault routes now.
			await reactAct(async () => drainPassiveEffects());
			expect(sink.message).toBe('island passive setup exploded');
			await mounted.unmount();
		} finally {
			quiet.mockRestore();
		}
	});

	it('routes a throwing child ref attachment to the React error boundary', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const sink = { message: null as string | null };
			const mounted = await mountReactHost(
				caughtBoundary(
					h(
						OctaneCompat,
						null,
						h(RefIsland as any, {
							ref: (element: Element | null) => {
								if (element !== null) throw new Error('island ref exploded');
							},
						}),
					),
					sink,
				),
			);
			expect(sink.message).toBe('island ref exploded');
			expect(mounted.container.querySelector('.react-caught')).not.toBeNull();
			await mounted.unmount();
		} finally {
			quiet.mockRestore();
		}
	});
});

describe('octane/react — episodes over committed content (§7)', () => {
	it('hides prior content behind the React fallback on a sync update suspension and preserves island state', async () => {
		const first = { status: 'fulfilled' as const, value: 'one', then() {} };
		const second = deferred<string>();
		function App(props: { resource: unknown }) {
			return h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(OctaneCompat, null, h(StatefulSuspendingIsland as any, { resource: props.resource })),
			);
		}
		const mounted = await mountReactHost(h(App, { resource: first }));
		const host = mounted.host();
		await reactAct(async () => (host.querySelector('.ss-count') as HTMLElement).click());
		expect(host.querySelector('.ss-count')?.textContent).toBe('count:1');

		// Sync (non-transition) update suspends: React refallbacks, the committed
		// Octane DOM is hidden — not torn down.
		await mounted.render(h(App, { resource: second.promise }));
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();
		expect(host.isConnected).toBe(true);
		expect(host.style.display).toBe('none');

		await reactAct(async () => {
			second.resolve('two');
			await second.promise;
		});
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(host.querySelector('.ss-value')?.textContent).toBe('value:two');
		// Octane-local state survived the whole episode.
		expect(host.querySelector('.ss-count')?.textContent).toBe('count:1');
		await mounted.unmount();
	});

	it('refallbacks on a transition-originated episode (v1 divergence) without tearing prior content', async () => {
		const first = { status: 'fulfilled' as const, value: 'held', then() {} };
		const second = deferred<string>();
		let setResource!: (resource: unknown) => void;
		function App() {
			const [resource, set] = React.useState<unknown>(first);
			setResource = set;
			return h(
				React.Suspense,
				{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
				h(OctaneCompat, null, h(StatefulSuspendingIsland as any, { resource })),
			);
		}
		const mounted = await mountReactHost(h(App));
		const host = mounted.host();
		expect(host.querySelector('.ss-value')?.textContent).toBe('value:held');

		// OCTANE DIVERGENCE (v1, plan §2 non-goal / open question 9): the
		// transition commits the new props first; the island's suspension then
		// surfaces from the layout-phase hosted flush as a NEW sync update, so
		// the boundary refallbacks — unlike a pure React tree, where the
		// transition itself would suspend and hold old content. Cross-renderer
		// transition entanglement (ReactSharedInternals.T) is deferred; what v1
		// guarantees is no tearing: prior DOM/state preserved under the fallback.
		await reactAct(async () => {
			React.startTransition(() => setResource(second.promise));
		});
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();
		expect(host.isConnected).toBe(true);
		expect(host.querySelector('.ss-value')?.textContent).toBe('value:held');

		await reactAct(async () => {
			second.resolve('arrived');
			await second.promise;
		});
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(host.querySelector('.ss-value')?.textContent).toBe('value:arrived');
		await mounted.unmount();
	});
});
