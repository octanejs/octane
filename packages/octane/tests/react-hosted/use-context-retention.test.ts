/**
 * Phase 0 spike — §6.2 / open question 15: does React retain a context
 * dependency newly recorded by `React.use(context)` when the SAME wrapper
 * attempt immediately suspends?
 *
 * Measured answer on React 19.2.7: YES, in both shapes that matter —
 *   1. an initial mount attempt that reads the context and then suspends;
 *   2. an update attempt on a committed wrapper whose FIRST read of the
 *      context happens in the attempt that suspends.
 * Provider-only updates issued while the attempt stays suspended re-render it
 * with the fresh value each time, and the dependency remains live after
 * recovery. The rare two-commit subscription handshake described in §6.2 is
 * therefore NOT required on React 19.2.x — these tests are the guard: if a
 * future React drops retention, they fail and the handshake becomes mandatory.
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { h, octaneChild, mountReactHost, reactAct, OctaneCompatSpike } from './_react-host.js';
import { ThemedSuspendingIsland } from './_fixtures/islands.tsrx';
import { MirrorTheme } from './_fixtures/mirror-context.js';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('React.use(context) dependency retention across suspended attempts (OQ15)', () => {
	it('retains a dependency recorded in an immediately-suspended INITIAL attempt', async () => {
		const Ctx = React.createContext('c0');
		const seen: string[] = [];
		const relay = deferred<void>();
		let suspended = true;

		// memo() with no props: after mount, ONLY a context propagation can
		// re-render this component — exactly the wrapper shape the compat design
		// relies on while an island episode is pending.
		const Wrapper = React.memo(function Wrapper() {
			const value = React.use(Ctx);
			seen.push(value);
			if (suspended) React.use(relay.promise);
			return h('p', { className: 'out' }, value);
		});

		let setCtx!: (value: string) => void;
		function App() {
			const [value, set] = React.useState('c1');
			setCtx = set;
			return h(
				Ctx,
				{ value } as any,
				h(React.Suspense, { fallback: h('p', { className: 'fb' }, 'fb') }, h(Wrapper)),
			);
		}

		const mounted = await mountReactHost(h(App));
		expect(mounted.container.querySelector('.fb')).not.toBeNull();
		expect(seen.at(-1)).toBe('c1');

		seen.length = 0;
		await reactAct(async () => setCtx('c2'));
		// The suspended attempt was re-rendered with the fresh provider value —
		// the dependency recorded before the throw was retained.
		expect(seen.at(-1)).toBe('c2');

		seen.length = 0;
		await reactAct(async () => setCtx('c3'));
		expect(seen.at(-1)).toBe('c3');

		suspended = false;
		await reactAct(async () => {
			relay.resolve();
			await relay.promise;
		});
		expect(mounted.container.querySelector('.fb')).toBeNull();
		expect(mounted.container.querySelector('.out')?.textContent).toBe('c3');

		await mounted.unmount();
	});

	it('retains a FIRST-read dependency recorded in a suspended UPDATE attempt on a committed wrapper', async () => {
		const Ctx = React.createContext('c0');
		const seen: string[] = [];
		const relay = deferred<void>();
		let readCtx = false;
		let suspendNow = false;

		const Wrapper = React.memo(function Wrapper(props: { epoch: number }) {
			const value = readCtx ? React.use(Ctx) : '(none)';
			seen.push(value);
			if (suspendNow) React.use(relay.promise);
			return h('p', { className: 'out' }, value);
		});

		let setCtx!: (value: string) => void;
		let bumpEpoch!: (updater: (epoch: number) => number) => void;
		function App() {
			const [value, set] = React.useState('c1');
			const [epoch, bump] = React.useState(0);
			setCtx = set;
			bumpEpoch = bump;
			return h(
				Ctx,
				{ value } as any,
				h(React.Suspense, { fallback: h('p', { className: 'fb' }, 'fb') }, h(Wrapper, { epoch })),
			);
		}

		const mounted = await mountReactHost(h(App));
		expect(seen).toEqual(['(none)']);
		expect(mounted.container.querySelector('.out')?.textContent).toBe('(none)');

		// The update attempt reads Ctx for the first time AND suspends.
		readCtx = true;
		suspendNow = true;
		await reactAct(async () => bumpEpoch((epoch) => epoch + 1));
		expect(mounted.container.querySelector('.fb')).not.toBeNull();
		expect(seen.at(-1)).toBe('c1');

		seen.length = 0;
		await reactAct(async () => setCtx('c2'));
		expect(seen.at(-1)).toBe('c2');

		suspendNow = false;
		await reactAct(async () => {
			relay.resolve();
			await relay.promise;
		});
		expect(mounted.container.querySelector('.out')?.textContent).toBe('c2');

		// The dependency survives recovery — provider-only updates stay live.
		seen.length = 0;
		await reactAct(async () => setCtx('c3'));
		expect(seen.at(-1)).toBe('c3');
		expect(mounted.container.querySelector('.out')?.textContent).toBe('c3');

		await mounted.unmount();
	});

	it('keeps an island context discovered in a suspending attempt live end-to-end', async () => {
		// §6.2 step 7: the island discovers the mirror context and suspends in the
		// SAME initial Octane attempt. The registry publishes with the status
		// notification, the wrapper subscribes before throwing the relay, and a
		// provider update issued while the episode is pending must be reflected
		// when the island reveals.
		const ReactTheme = React.createContext('unset');
		const resource = deferred<string>();
		let setTheme!: (value: string) => void;
		function App() {
			const [theme, set] = React.useState('dark');
			setTheme = set;
			return h(
				ReactTheme,
				{ value: theme } as any,
				h(
					React.Suspense,
					{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
					h(
						OctaneCompatSpike,
						{ contexts: [{ react: ReactTheme as React.Context<any>, mirror: MirrorTheme }] },
						octaneChild(ThemedSuspendingIsland, { resource: resource.promise }),
					),
				),
			);
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();

		// Provider-only update while the first-discovery attempt is suspended.
		await reactAct(async () => setTheme('light'));

		await reactAct(async () => {
			resource.resolve('data');
			await resource.promise;
		});
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		// The island reveals with the LATEST provider value: the reveal-time
		// layout publish supersedes the snapshot the episode started with.
		expect(mounted.host().querySelector('.themed-resolved')?.textContent).toBe('light:data');

		await mounted.unmount();
	});
});
