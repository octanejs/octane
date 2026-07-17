/**
 * Phase 0 spike — §5 lifecycle rule 7: the deferred host-connectivity check
 * must discriminate three signals that look identical from inside a layout
 * cleanup:
 *
 *   1. a React StrictMode development setup/cleanup probe   → keep the root;
 *   2. React Suspense hiding already-visible content        → keep the root;
 *   3. a real unmount                                       → dispose exactly once.
 *
 * Measured React 19.2 signal matrix (see `_react-host.ts`):
 *   - hide destroys layout effects and detaches refs, but PASSIVE effects
 *     stay connected;
 *   - deleting an already-hidden tree fires ONLY the passive cleanup;
 *   - deletion removes the host from the document within the same commit,
 *     while probes and hides leave it connected.
 * The spike therefore schedules the post-commit connectivity check from both
 * the host ref detach and the wrapper's passive cleanup.
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { createLog } from '../_helpers.js';
import {
	h,
	octaneChild,
	mountReactHost,
	reactAct,
	IslandController,
	OctaneCompatSpike,
} from './_react-host.js';
import { BadgeIsland, CleanupThrowIsland, GreetingIsland } from './_fixtures/islands.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('react-hosted island — hide/probe/unmount discrimination (§5 rule 7)', () => {
	it('survives the StrictMode development setup/cleanup probe without disposing', async () => {
		const log = createLog();
		let controller: IslandController | null = null;
		const mounted = await mountReactHost(
			h(
				React.StrictMode,
				null,
				h(
					OctaneCompatSpike,
					{
						controllerRef: (instance: IslandController) => {
							controller = instance;
						},
					},
					octaneChild(GreetingIsland, { name: 'strict', log: log.push }),
				),
			),
		);

		// The probe re-ran the wrapper's layout setup, but the discriminator kept
		// the hosted root: no disposal, no island remount, octane cleanup never ran.
		expect(controller!.isDisposed).toBe(false);
		expect(controller!.hasLiveRoot).toBe(true);
		expect(controller!.lifecycle).not.toContain('disposed-by-unmount');
		expect(controller!.lifecycle).not.toContain('hidden');
		// The probe genuinely scheduled a dispose check that a newer attachment
		// generation canceled — the discriminator was exercised, not bypassed.
		expect(controller!.lifecycle).toContain('dispose-check-canceled');
		expect(log.entries.filter((entry) => entry.startsWith('island-cleanup'))).toEqual([]);

		// Octane state and events stay live after the probe.
		const button = mounted.host().querySelector('.count') as HTMLElement;
		await reactAct(async () => button.click());
		expect(button.textContent).toBe('count:1');

		await mounted.unmount();
		expect(controller!.isDisposed).toBe(true);
		expect(log.entries.filter((entry) => entry.startsWith('island-cleanup'))).toEqual([
			'island-cleanup:strict',
		]);
	});

	it('treats Suspense hide as visibility, preserving Octane DOM, state, and root, then reattaches on reveal', async () => {
		const log = createLog();
		const gate = deferred<void>();
		let controller: IslandController | null = null;
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
				h(
					OctaneCompatSpike,
					{
						controllerRef: (instance: IslandController) => {
							controller = instance;
						},
					},
					octaneChild(GreetingIsland, { name: 'hide', log: log.push }),
				),
				h(Sibling),
			),
		);
		const host = mounted.host();
		const button = host.querySelector('.count') as HTMLElement;
		await reactAct(async () => button.click());
		expect(button.textContent).toBe('count:1');
		log.clear();

		// A sibling suspends: React hides the committed island instead of
		// unmounting it.
		await reactAct(async () => setSuspended(true));
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();
		expect(host.isConnected).toBe(true);
		expect(host.style.display).toBe('none');
		expect(controller!.lifecycle).toContain('hidden');
		expect(controller!.isDisposed).toBe(false);
		expect(controller!.hasLiveRoot).toBe(true);
		// The hosted Octane tree was NOT torn down — DOM, state, and effects kept.
		// (Octane's own effects are not disconnect/reconnected in Phase 0; explicit
		// Offscreen semantics are open question 13.)
		expect(host.querySelector('.count')?.textContent).toBe('count:1');
		expect(log.drain()).toEqual([]);

		await reactAct(async () => {
			gate.resolve();
			await gate.promise;
		});
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(host.style.display).not.toBe('none');
		// Same host, same octane root, same state — and still interactive.
		expect(host.querySelector('.count')?.textContent).toBe('count:1');
		await reactAct(async () => (host.querySelector('.count') as HTMLElement).click());
		expect(host.querySelector('.count')?.textContent).toBe('count:2');

		await mounted.unmount();
		expect(controller!.isDisposed).toBe(true);
	});

	it('disposes exactly once when React deletes an island that is currently hidden', async () => {
		// The leak trap this discriminator must not fall into: hide already ran
		// the layout cleanup AND detached the ref, so deletion of the hidden tree
		// fires only the passive cleanup. Disposal must still happen — once.
		const log = createLog();
		const gate = deferred<void>();
		let controller: IslandController | null = null;
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
				h(
					OctaneCompatSpike,
					{
						controllerRef: (instance: IslandController) => {
							controller = instance;
						},
					},
					octaneChild(GreetingIsland, { name: 'hidden-delete', log: log.push }),
				),
				h(Sibling),
			),
		);
		await reactAct(async () => setSuspended(true));
		expect(controller!.lifecycle).toContain('hidden');
		expect(controller!.hasLiveRoot).toBe(true);
		log.clear();

		await mounted.unmount();
		expect(controller!.isDisposed).toBe(true);
		expect(controller!.hasLiveRoot).toBe(false);
		expect(log.drain()).toEqual(['island-cleanup:hidden-delete']);
		expect(controller!.lifecycle.filter((event) => event === 'disposed-by-unmount')).toHaveLength(
			1,
		);
	});

	it('captures a hosted cleanup fault raised during deferred disposal without scheduling the dead wrapper', async () => {
		// §5 rule 8 refinement discovered by this spike: because disposal is
		// deferred past React's commit (rule 7's connectivity check), a cleanup
		// fault can no longer re-throw synchronously into React's commit-error
		// path. routeError() still declines (no state is scheduled on the deleting
		// controller); the fault surfaces on the controller for an explicit
		// reporting channel to be chosen before Phase 1.
		let controller: IslandController | null = null;
		const reactErrors: unknown[] = [];
		const mounted = await mountReactHost(
			h(
				OctaneCompatSpike,
				{
					controllerRef: (instance: IslandController) => {
						controller = instance;
					},
				},
				octaneChild(CleanupThrowIsland, {}),
			),
			{ onUncaughtError: (error) => reactErrors.push(error) },
		);
		expect(mounted.host().querySelector('.cleanup-throw')?.textContent).toBe('armed');

		await mounted.unmount();
		expect(controller!.isDisposed).toBe(true);
		expect((controller!.disposeFault as Error).message).toBe('island cleanup exploded');
		// The fault never re-entered React: no uncaught-error report, no scheduled
		// state on the deleted wrapper.
		expect(reactErrors).toEqual([]);
	});

	it('tolerates a later React commit after the host DOM was externally removed', async () => {
		// External-DOM-removal reconciliation (§5 rule 7): React still believes
		// the Fiber is alive, so a subsequent commit republishes props into the
		// detached host. Octane's safe-cleanup guarantee keeps this non-fatal.
		function App(props: { label: string }) {
			return h(OctaneCompatSpike, null, octaneChild(BadgeIsland, { label: props.label }));
		}
		const mounted = await mountReactHost(h(App, { label: 'before' }));
		const host = mounted.host();
		host.remove();
		expect(host.isConnected).toBe(false);

		// React re-commits; the wrapper's layout publish renders into the detached
		// host without faulting.
		await mounted.render(h(App, { label: 'after' }));
		expect(host.querySelector('.badge')?.textContent).toBe('badge:after');
	});
});
