import { afterEach, describe, expect, it } from 'vitest';
import { act, flushSync, hydrateRoot, startTransition, type Root } from 'octane';
import { renderToString } from 'octane/server';
import { bootstrapStreamedSignalHydration } from 'octane/hydration/streamed-signals';
import {
	createResource,
	createScope,
	query,
	type Scope,
	type ScopeSeed,
	type WritableSignal,
} from 'octane/signals';
import { renderToPipeableStream } from '../src/runtime.server.js';
import * as signals from '../src/signals/index.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	resetStreamRuntimeGlobals,
} from './_server-stream.js';
import { deferred, drainProducers, type Deferred } from './_fixtures/signals-async-controls.js';
import * as client from './_fixtures/signals-adopted-transition.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/signals-adopted-transition.tsrx',
	{
		runtimeModules: {
			'octane/signals': signals,
			'octane/signals/query': signals,
			'octane/signals/facade': signals,
		},
	},
);

/**
 * Router loader data is seeded or streamed by the server and adopted by the
 * browser. A client navigation then writes the location inside a transition:
 * the adopted screen stays committed while the new selection loads privately.
 */
type RouteKind = 'explicit' | 'query' | 'stream';

interface Route {
	location$: WritableSignal<string>;
	/** Every browser load, in start order. */
	requests: { key: string; signal: AbortSignal }[];
	resolve(key: string, value: string): Promise<void>;
	reject(key: string, error: Error): Promise<void>;
	errors: unknown[];
	output: Element | null;
}

describe('transitions over server-adopted query state', () => {
	let container: HTMLElement | undefined;
	let root: Root | undefined;
	const cleanups: (() => void)[] = [];

	afterEach(() => {
		root?.unmount();
		root = undefined;
		for (const cleanup of cleanups.splice(0)) cleanup();
		container?.remove();
		container = undefined;
		resetStreamRuntimeGlobals();
	});

	function scope(scopeKey: string, seed?: ScopeSeed): Scope {
		const created = createScope({ scopeKey, ...(seed ? { seed } : {}) });
		cleanups.push(() => created.dispose());
		return created;
	}

	function mount(html: string): void {
		container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
	}

	const text = (selector: string) => container!.querySelector(selector)?.textContent ?? null;

	/** Browser loads that settle only when a test says so. */
	function browserLoads(kind: RouteKind) {
		const loads = new Map<string, Deferred<string>>();
		const requests: Route['requests'] = [];
		const settle = (key: string): Deferred<string> => {
			let load = loads.get(key);
			if (!load) loads.set(key, (load = deferred<string>()));
			return load;
		};
		const load = (key: string, { signal }: { signal: AbortSignal }) => {
			requests.push({ key, signal });
			const result = settle(key).promise;
			if (kind !== 'stream') return result;
			return (async function* () {
				yield await result;
			})();
		};
		const resolve = async (key: string, value: string) => {
			await act(async () => {
				settle(key).resolve(value);
				await drainProducers();
			});
		};
		const reject = async (key: string, error: Error) => {
			await act(async () => {
				settle(key).reject(error);
				await drainProducers();
			});
		};
		return { load, requests, resolve, reject };
	}

	function hydrate(
		Component: (props: any) => unknown,
		props: object,
		options: { signalOwner?: object } = {},
	): unknown[] {
		const errors: unknown[] = [];
		root = hydrateRoot(
			container!,
			Component as never,
			props as never,
			{
				...options,
				onUncaughtError: (error: unknown) => errors.push(error),
				onRecoverableError: (error: unknown) => errors.push(error),
			} as never,
		);
		return errors;
	}

	/** Server-render a route over an explicit resource, then adopt it into the browser's seeded scope. */
	async function explicitRoute$(
		scopeKey: string,
		clientProps?: (client: { scope: Scope; location$: WritableSignal<string> }) => object,
	): Promise<Route> {
		const serverScope = scope(scopeKey);
		const serverLocation$ = serverScope.signal$('location', 'A');
		const serverLookup = query(scopeKey, (key: string) => 'server-' + key);
		const serverResource$ = createResource(serverScope, 'data', () =>
			serverLookup(serverLocation$.get()),
		);
		await act(() => {});
		mount(
			renderToString(server.ExplicitRoute, {
				location$: serverLocation$,
				resource$: serverResource$,
			}).html,
		);
		const output = container!.querySelector('output');
		expect(output?.textContent).toBe('server-A');

		const browser = browserLoads('explicit');
		const seed = JSON.parse(JSON.stringify(serverScope.serialize())) as ScopeSeed;
		const clientScope = scope(scopeKey, seed);
		const location$ = clientScope.signal$('location', 'A');
		const lookup = query(
			scopeKey,
			browser.load as (key: string, context: { signal: AbortSignal }) => Promise<string>,
		);
		const resource$ = createResource(clientScope, 'data', () => lookup(location$.get()));
		let errors!: unknown[];
		await act(() => {
			errors = hydrate(client.ExplicitRoute, {
				location$,
				resource$,
				...clientProps?.({ scope: clientScope, location$ }),
			});
		});
		return { ...browser, location$, errors, output };
	}

	/** Stream a route over an owner-optional query, then adopt it through the streamed receiver. */
	async function ownedRoute$(kind: 'query' | 'stream'): Promise<Route> {
		const scopeKey = 'adopted-' + kind;
		const serverScope = scope(scopeKey);
		const serverLocation$ = serverScope.signal$('location', 'A');
		const collector = createPipeableCollector();
		const controller = new AbortController();
		cleanups.push(() => controller.abort());
		const streamedSignals = { buildId: scopeKey + '-build', documentId: scopeKey + '-document' };
		renderToPipeableStream(
			server.OwnedRoute,
			{
				location$: serverLocation$,
				load:
					kind === 'stream'
						? async function* (key: string) {
								yield 'server-' + key;
							}
						: async (key: string) => 'server-' + key,
				...(kind === 'stream' ? { kind } : {}),
			},
			{ signal: controller.signal, streamedSignals },
		).pipe(collector.destination);
		mount(await collector.ended);
		activateStreamedMarkup(container!);
		const output = container!.querySelector('output');
		expect(output?.textContent).toBe('server-A');

		const hydration = bootstrapStreamedSignalHydration(streamedSignals);
		cleanups.push(() => hydration.dispose());
		const location$ = scope(scopeKey).signal$('location', 'A');
		const browser = browserLoads(kind);
		let errors!: unknown[];
		await act(() => {
			errors = hydrate(
				client.OwnedRoute,
				{ location$, load: browser.load, ...(kind === 'stream' ? { kind } : {}) },
				{ signalOwner: hydration.signalOwner },
			);
		});
		await act(() => drainProducers());
		return { ...browser, location$, errors, output };
	}

	const route$ = (kind: RouteKind) =>
		kind === 'explicit' ? explicitRoute$('adopted-explicit') : ownedRoute$(kind);

	describe.each(['explicit', 'query', 'stream'] as const)('%s loader data', (kind) => {
		it('adopts the server result without a browser load', async () => {
			const route = await route$(kind);
			expect(route.requests).toEqual([]);
			expect(container!.querySelector('output')).toBe(route.output);
			expect(route.errors).toEqual([]);
		});

		it('keeps the adopted screen committed while a new selection loads', async () => {
			const route = await route$(kind);
			await act(() => startTransition(() => route.location$.set('B')));
			expect(route.errors).toEqual([]);
			expect(route.location$.get()).toBe('A');
			expect(text('b')).toBe('A');
			expect(container!.querySelector('output')).toBe(route.output);
			expect(text('output')).toBe('server-A');
			expect(route.requests.map(({ key }) => key)).toEqual(['B']);

			await route.resolve('B', 'client-B');
			expect(route.location$.get()).toBe('B');
			expect(text('b')).toBe('B');
			expect(text('output')).toBe('client-B');
			expect(route.requests.map(({ key }) => key)).toEqual(['B']);
			expect(route.errors).toEqual([]);
		});

		it('commits the error of a failed selection to the boundary', async () => {
			const route = await route$(kind);
			await act(() => startTransition(() => route.location$.set('B')));
			expect(text('output')).toBe('server-A');
			await route.reject('B', new Error('missing B'));
			expect(route.location$.get()).toBe('B');
			expect(text('.caught')).toBe('missing B');
			expect(text('output')).toBe(null);
		});

		it('returns to the adopted selection without loading it again', async () => {
			const route = await route$(kind);
			await act(() => startTransition(() => route.location$.set('B')));
			expect(route.requests.map(({ key }) => key)).toEqual(['B']);
			// A→B→A before B settles: the equal selection reuses the adopted result.
			await act(() => startTransition(() => route.location$.set('A')));
			expect(route.errors).toEqual([]);
			expect(route.requests.map(({ key }) => key)).toEqual(['B']);
			expect(route.requests[0]!.signal.aborted).toBe(true);
			expect(route.location$.get()).toBe('A');
			expect(container!.querySelector('output')).toBe(route.output);
			expect(text('output')).toBe('server-A');
			// The abandoned attempt never publishes.
			await route.resolve('B', 'obsolete-B');
			expect(text('b')).toBe('A');
			expect(text('output')).toBe('server-A');
		});

		it('loads the adopted selection again once the route has moved past it', async () => {
			const route = await route$(kind);
			await act(() => startTransition(() => route.location$.set('B')));
			await route.resolve('B', 'client-B');
			expect(text('output')).toBe('client-B');
			// A→B→A after B commits: the server result no longer owns the A route.
			await act(() => startTransition(() => route.location$.set('A')));
			expect(route.requests.map(({ key }) => key)).toEqual(['B', 'A']);
			expect(text('b')).toBe('B');
			expect(text('output')).toBe('client-B');
			await route.resolve('A', 'client-A');
			expect(text('b')).toBe('A');
			expect(text('output')).toBe('client-A');
			expect(route.errors).toEqual([]);
		});

		it('aborts a superseded selection and never publishes it', async () => {
			const route = await route$(kind);
			await act(() => startTransition(() => route.location$.set('B')));
			await act(() => startTransition(() => route.location$.set('C')));
			expect(route.requests.map(({ key }) => key)).toEqual(['B', 'C']);
			expect(route.requests[0]!.signal.aborted).toBe(true);
			expect(text('output')).toBe('server-A');
			await route.resolve('B', 'obsolete-B');
			expect(text('b')).toBe('A');
			expect(text('output')).toBe('server-A');
			await route.resolve('C', 'client-C');
			expect(text('b')).toBe('C');
			expect(text('output')).toBe('client-C');
			expect(route.errors).toEqual([]);
		});

		it('rebases the pending selection over a later urgent write', async () => {
			const route = await route$(kind);
			await act(() => startTransition(() => route.location$.set('B')));
			// The urgent write commits at once. As in React, the transition replays
			// its queued updates in order, so the later urgent value wins there too.
			await act(() => route.location$.set('C'));
			expect(route.location$.get()).toBe('C');
			await route.resolve('C', 'client-C');
			expect(text('b')).toBe('C');
			expect(text('output')).toBe('client-C');
			await route.resolve('B', 'obsolete-B');
			expect(route.location$.get()).toBe('C');
			expect(text('output')).toBe('client-C');
			expect(route.errors).toEqual([]);
		});

		it('aborts the pending selection when the route unmounts', async () => {
			const route = await route$(kind);
			await act(() => startTransition(() => route.location$.set('B')));
			expect(route.requests[0]!.signal.aborted).toBe(false);
			flushSync(() => root!.unmount());
			root = undefined;
			expect(route.requests[0]!.signal.aborted).toBe(true);
		});
	});

	it('stages a transition started while hydration still holds the adoption frame', async () => {
		let leases = -1;
		const thrown: unknown[] = [];
		const route = await explicitRoute$('adopted-layout', ({ scope, location$ }) => ({
			onLayout() {
				leases = scope.inspect().adoptionLeases;
				startTransition(() => {
					// A synchronous refusal here would be reported globally, not to the root.
					try {
						location$.set('B');
					} catch (error) {
						thrown.push(error);
					}
				});
			},
		}));
		expect(leases).toBe(1);
		expect(thrown).toEqual([]);
		expect(route.errors).toEqual([]);
		// Release did not rewind or skip past the pending selection.
		expect(route.location$.get()).toBe('A');
		expect(text('b')).toBe('A');
		expect(text('output')).toBe('server-A');
		expect(route.requests.map(({ key }) => key)).toEqual(['B']);
		await route.resolve('B', 'client-B');
		expect(text('b')).toBe('B');
		expect(text('output')).toBe('client-B');
	});
});
