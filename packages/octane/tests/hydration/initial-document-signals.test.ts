import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot, type Root } from 'octane';
import {
	bootstrapIndependentHydration,
	condition,
	createStreamedRegionReceiver,
	interaction,
	type StreamFrameIdentity,
} from 'octane/hydration';
import {
	createStreamedRegionPlacementFrame,
	renderToPipeableStream,
	renderToReadableStream,
	renderToString,
} from 'octane/server';
import * as Signals from 'octane/signals';
import { createScope, runWithSignalOwner, type ScopeSeed } from 'octane/signals';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import type { CommitObservation, DocumentProps } from './_fixtures/initial-document-signals.tsrx';

const source = readFileSync(
	'packages/octane/tests/hydration/_fixtures/initial-document-signals.tsrx',
	'utf8',
);
const independentSource = readFileSync(
	'packages/octane/tests/hydration/_fixtures/initial-document-independent.tsrx',
	'utf8',
);

function fixture(dev: boolean) {
	const options = {
		id: '/src/initial-document-signals.tsrx',
		compileOptions: { dev, hmr: false },
		runtimeModules: { 'octane/signals': Signals },
	};
	const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
	const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
	const independentId = '/src/initial-document-independent.tsrx';
	const independentServer = loadCompiledFixtureSource(independentSource, {
		...options,
		id: independentId,
		mode: 'server',
		runtimeModules: { ...options.runtimeModules, './initial-document-signals.tsrx': server },
	});
	return {
		server: { ...server, Independent: independentServer.Independent },
		client,
		independent: () =>
			loadCompiledFixtureSource(independentSource, {
				...options,
				id: independentId + '?octane-hydrate=0',
				mode: 'client',
				runtimeModules: { ...options.runtimeModules, './initial-document-signals.tsrx': client },
			}),
	};
}

function copy(seed: ScopeSeed): ScopeSeed {
	return JSON.parse(JSON.stringify(seed));
}

function invalidSeed(seed: ScopeSeed, kind: 'malformed' | 'mismatched'): ScopeSeed {
	return kind === 'malformed'
		? { ...seed, entries: [...seed.entries, seed.entries[0]!] }
		: { ...seed, scopeKey: 'another-document' };
}

function observations(id: string, route: string, current: string): CommitObservation {
	return { id, rendered: route, current, text: route };
}

afterEach(() => {
	resetStreamRuntimeGlobals();
});

for (const dev of [false, true]) {
	describe(`${dev ? 'development' : 'production'} compiled initial document signal history`, () => {
		it('adopts matching eager and deferred history before catching up to preactivation writes', async () => {
			const { server, client } = fixture(dev);
			const serverOwner = createScope({ scopeKey: 'initial-document' });
			const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
			const container = document.createElement('div');
			document.body.append(container);
			const committed: CommitObservation[] = [];
			const observe = (value: CommitObservation) => committed.push(value);
			const recoverable: unknown[] = [];
			const warning = vi.spyOn(console, 'warn');
			const error = vi.spyOn(console, 'error');
			let root: Root | undefined;
			try {
				runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
				const initialDocumentSignals = serverOwner.serialize();
				const props: DocumentProps = {
					when: interaction({ events: 'click' }),
					secondWhen: interaction({ events: 'click' }),
					observe,
				};
				const rendered = renderToString(server.Document, props, {
					signalOwner: serverOwner,
					initialDocumentSignals,
				});
				expect(rendered.signals).toMatchObject({
					version: 2,
					scopes: [],
					initialDocument: { scopeKey: serverOwner.scopeKey },
				});
				container.innerHTML = rendered.html;
				const hosts = [...container.querySelectorAll('main,h1,section,output,input')];
				const inputs = [...container.querySelectorAll('input')];
				inputs[0]!.value = 'typed before activation';
				const clientSeed = copy(initialDocumentSignals);
				runWithSignalOwner(clientOwner, () => client.route$.set('home'));
				root = hydrateRoot(container, client.Document, props, {
					signalOwner: clientOwner,
					initialDocumentSignals: clientSeed,
					onRecoverableError: (value) => recoverable.push(value),
				});
				expect(committed).toEqual([observations('heading', 'thread', 'home')]);
				expect(runWithSignalOwner(clientOwner, () => client.route$.get())).toBe('home');
				await act(() => {});
				expect(container.querySelector('h1')!.textContent).toBe('home');
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'thread',
					'thread',
				]);
				// The root owns an immutable adoption snapshot for boundaries activated later.
				(clientSeed.entries[0]!.value as ['string', string])[1] = 'mutated seed';
				await act(() => {
					container
						.querySelector('[data-reader="first"] > output')!
						.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				});
				expect(committed).toEqual([
					observations('heading', 'thread', 'home'),
					observations('first', 'thread', 'home'),
				]);
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'home',
					'thread',
				]);
				await act(() => runWithSignalOwner(clientOwner, () => client.route$.set('live edit')));
				await act(() => {
					container
						.querySelector('[data-reader="second"] > output')!
						.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				});
				expect(committed.at(-1)).toEqual(observations('second', 'thread', 'live edit'));
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'live edit',
					'live edit',
				]);
				expect(runWithSignalOwner(clientOwner, () => client.route$.get())).toBe('live edit');
				expect([...container.querySelectorAll('main,h1,section,output,input')]).toEqual(hosts);
				expect(inputs[0]!.value).toBe('typed before activation');
				expect(recoverable).toEqual([]);
				expect(warning.mock.calls).toEqual([]);
				expect(error.mock.calls).toEqual([]);
			} finally {
				root?.unmount();
				expect(clientOwner.inspect().adoptionLeases).toBe(0);
				clientOwner.dispose();
				serverOwner.dispose();
				warning.mockRestore();
				error.mockRestore();
				container.remove();
			}
		});

		it('preserves separate region history when a later server value differs from the initial document', async () => {
			const { server, client } = fixture(dev);
			const serverOwner = createScope({ scopeKey: 'distinct-document' });
			const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
			const containers = [document.createElement('div'), document.createElement('div')];
			document.body.append(...containers);
			const roots: Root[] = [];
			const committed: CommitObservation[] = [];
			const observe = (value: CommitObservation) => committed.push(value);
			const recoverable: unknown[] = [];
			try {
				runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
				const initialDocumentSignals = serverOwner.serialize();
				const rendered = ['thread', 'other history'].map((route, index) => {
					runWithSignalOwner(serverOwner, () => server.route$.set(route));
					return renderToString(
						server.Region,
						{ id: `region-${index}`, when: condition(false), observe },
						{ signalOwner: serverOwner, initialDocumentSignals, identifierPrefix: `r${index}-` },
					);
				});
				const hosts = rendered.map((result, index) => {
					containers[index]!.innerHTML = result.html;
					return [...containers[index]!.querySelectorAll('section,output,input')];
				});
				runWithSignalOwner(clientOwner, () => client.route$.set('home'));
				for (let index = 0; index < containers.length; index++) {
					roots.push(
						hydrateRoot(
							containers[index]!,
							client.Region,
							{
								id: `region-${index}`,
								when: condition(false),
								observe,
							},
							{
								signalOwner: clientOwner,
								initialDocumentSignals,
								identifierPrefix: `r${index}-`,
								onRecoverableError: (value) => recoverable.push(value),
							},
						),
					);
				}
				await act(() => {
					roots.forEach((root, index) =>
						root.render(client.Region, {
							id: `region-${index}`,
							when: condition(true),
							observe,
						}),
					);
				});
				expect(committed).toEqual([
					observations('region-0', 'thread', 'home'),
					observations('region-1', 'other history', 'home'),
				]);
				expect(
					containers.map((container) => container.querySelector('output')!.textContent),
				).toEqual(['home', 'home']);
				containers.forEach((container, index) =>
					expect([...container.querySelectorAll('section,output,input')]).toEqual(hosts[index]),
				);
				expect(recoverable).toEqual([]);
			} finally {
				roots.forEach((root) => root.unmount());
				expect(clientOwner.inspect().adoptionLeases).toBe(0);
				clientOwner.dispose();
				serverOwner.dispose();
				containers.forEach((container) => container.remove());
			}
		});

		it.each(['missing', 'scope', 'entry', 'duplicate'])(
			'rejects a %s initial document seed before consuming its compact HTML',
			async (invalid) => {
				const { server, client } = fixture(dev);
				const serverOwner = createScope({ scopeKey: 'validated-document' });
				const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
				const container = document.createElement('div');
				document.body.append(container);
				let root: Root | undefined;
				try {
					runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
					const initialDocumentSignals = serverOwner.serialize();
					const props = { when: condition(false) };
					container.innerHTML = renderToString(server.Document, props, {
						signalOwner: serverOwner,
						initialDocumentSignals,
					}).html;
					const before = [...container.childNodes];
					const invalidSeed =
						invalid === 'missing'
							? undefined
							: invalid === 'scope'
								? { ...initialDocumentSignals, scopeKey: 'other-document' }
								: {
										...initialDocumentSignals,
										entries:
											invalid === 'entry'
												? []
												: [initialDocumentSignals.entries[0]!, initialDocumentSignals.entries[0]!],
									};
					expect(() =>
						hydrateRoot(container, client.Document, props, {
							signalOwner: clientOwner,
							...(invalidSeed === undefined ? {} : { initialDocumentSignals: invalidSeed }),
						}),
					).toThrow(/initial document/i);
					expect([...container.childNodes]).toEqual(before);
					root = hydrateRoot(container, client.Document, props, {
						signalOwner: clientOwner,
						initialDocumentSignals,
					});
					expect(container.querySelector('h1')!.textContent).toBe('thread');
				} finally {
					root?.unmount();
					expect(clientOwner.inspect().adoptionLeases).toBe(0);
					clientOwner.dispose();
					serverOwner.dispose();
					container.remove();
				}
			},
		);

		it('adopts an independent boundary after asynchronous module loading with the captured initial seed', async () => {
			const { server, client, independent } = fixture(dev);
			const serverOwner = createScope({ scopeKey: 'independent-document' });
			const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
			const container = document.createElement('div');
			document.body.append(container);
			const committed: CommitObservation[] = [];
			const observe = (event: Event) =>
				committed.push((event as CustomEvent<CommitObservation>).detail);
			document.addEventListener('initial-document-commit', observe);
			const delivered = deferred<Record<string, unknown>>();
			const loadModule = vi.fn(() => delivered.promise);
			const errors: unknown[] = [];
			const warning = vi.spyOn(console, 'warn');
			const error = vi.spyOn(console, 'error');
			let cleanup: (() => void) | undefined;
			try {
				runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
				const initialDocumentSignals = serverOwner.serialize();
				container.innerHTML = renderToString(server.Independent, undefined, {
					signalOwner: serverOwner,
					initialDocumentSignals,
					independentHydration: {
						buildId: 'initial-document-build',
						resolve: () => ({ moduleId: 'initial-document-widget', styles: [] }),
					},
				}).html;
				const hosts = [...container.querySelectorAll('aside,section,output,input')];
				const input = container.querySelector('input')!;
				input.value = 'typed before independent activation';
				runWithSignalOwner(clientOwner, () => client.route$.set('home'));
				const clientSeed = copy(initialDocumentSignals);
				cleanup = bootstrapIndependentHydration(container, {
					buildId: 'initial-document-build',
					signalOwner: clientOwner,
					initialDocumentSignals: clientSeed,
					loadStyles() {},
					loadModule,
					onError: (value) => errors.push(value),
				});
				await vi.waitFor(() => expect(loadModule).toHaveBeenCalled());
				(clientSeed.entries[0]!.value as ['string', string])[1] = 'mutated seed';
				delivered.resolve(independent());
				await vi.waitFor(() =>
					expect(committed).toEqual([observations('independent', 'thread', 'home')]),
				);
				await act(() => {});
				expect(container.querySelector('output')!.textContent).toBe('home');
				expect(runWithSignalOwner(clientOwner, () => client.route$.get())).toBe('home');
				expect([...container.querySelectorAll('aside,section,output,input')]).toEqual(hosts);
				expect(input.value).toBe('typed before independent activation');
				expect(errors).toEqual([]);
				expect(warning.mock.calls).toEqual([]);
				expect(error.mock.calls).toEqual([]);
				cleanup();
				cleanup = undefined;
				expect(clientOwner.inspect().adoptionLeases).toBe(0);
				expect(clientOwner.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
			} finally {
				cleanup?.();
				document.removeEventListener('initial-document-commit', observe);
				clientOwner.dispose();
				serverOwner.dispose();
				warning.mockRestore();
				error.mockRestore();
				container.remove();
			}
		});

		it('materializes compact renderer history into a full placement frame without rewinding its live owner', async () => {
			const { server, client } = fixture(dev);
			const identity: StreamFrameIdentity = {
				protocol: 1,
				buildId: 'placement-build',
				documentId: 'placement-document',
				ownerKey: 'placement-owner',
				instanceKey: 'placement-region',
				nodeKey: 'route',
				selectionKey: 'selected-region',
				selectionGeneration: 1,
				attempt: 0,
			};
			const serverOwner = createScope({ scopeKey: identity.ownerKey });
			const clientOwner = createScope({ scopeKey: identity.ownerKey });
			const container = document.createElement('div');
			const start = document.createComment('[');
			const end = document.createComment(']');
			container.append(start, end);
			document.body.append(container);
			const committed: CommitObservation[] = [];
			const observe = (value: CommitObservation) => committed.push(value);
			const recoverable: unknown[] = [];
			const receiver = createStreamedRegionReceiver(identity);
			let root: Root | undefined;
			let active = false;
			try {
				runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
				const initialDocumentSignals = serverOwner.serialize();
				const props = { when: condition(false), observe };
				const rendered = renderToString(server.Document, props, {
					signalOwner: serverOwner,
					initialDocumentSignals,
				});
				expect(() =>
					createStreamedRegionPlacementFrame(identity, rendered, {
						sequence: 0,
						contentRevision: 1,
					}),
				).toThrow(/initial document/i);
				const frame = createStreamedRegionPlacementFrame(identity, rendered, {
					sequence: 0,
					contentRevision: 1,
					initialDocumentSignals,
				});
				expect(frame.historicalFrame).toEqual(initialDocumentSignals);
				runWithSignalOwner(clientOwner, () => client.route$.set('newer live value'));
				receiver.registerSelection(identity);
				receiver.attachResult(identity, {
					accept() {},
					fail(value) {
						throw value;
					},
				});
				receiver.registerRegion({
					identity,
					start,
					end,
					contentRevision: 0,
					isActive: () => active,
					loadStyles() {},
					adoptHistoricalFrame: (seed) => clientOwner.beginAdoption(seed),
				});
				expect(await receiver.receive(frame)).toBe('accepted');
				expect(runWithSignalOwner(clientOwner, () => client.route$.get())).toBe('newer live value');
				const hosts = [...container.querySelectorAll('main,h1,section,output,input')];
				active = true;
				start.remove();
				end.remove();
				// Placement keeps its full historicalFrame protocol. Compact HTML
				// sidecars still use the original document seed during root adoption.
				root = hydrateRoot(container, client.Document, props, {
					signalOwner: clientOwner,
					initialDocumentSignals,
					onRecoverableError: (value) => recoverable.push(value),
				});
				await act(() => root!.render(client.Document, { ...props, when: condition(true) }));
				expect(committed).toEqual([
					observations('heading', 'thread', 'newer live value'),
					observations('first', 'thread', 'newer live value'),
					observations('second', 'thread', 'newer live value'),
				]);
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'newer live value',
					'newer live value',
				]);
				expect([...container.querySelectorAll('main,h1,section,output,input')]).toEqual(hosts);
				expect(recoverable).toEqual([]);
				expect(await receiver.receive({ ...frame, sequence: 1, contentRevision: 2 })).toBe('stale');
			} finally {
				root?.unmount();
				receiver.dispose();
				expect(clientOwner.inspect().adoptionLeases).toBe(0);
				clientOwner.dispose();
				serverOwner.dispose();
				container.remove();
			}
		});

		it('retains standalone history when the document seed option is omitted', async () => {
			const { server, client } = fixture(dev);
			const serverOwner = createScope({ scopeKey: 'standalone-document' });
			const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
			const container = document.createElement('div');
			document.body.append(container);
			const committed: CommitObservation[] = [];
			const props = {
				when: condition(false),
				observe: (value: CommitObservation) => committed.push(value),
			};
			const recoverable: unknown[] = [];
			let root: Root | undefined;
			try {
				runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
				const rendered = renderToString(server.Document, props, { signalOwner: serverOwner });
				expect(rendered.signals).toMatchObject({ version: 1 });
				container.innerHTML = rendered.html;
				const hosts = [...container.querySelectorAll('main,h1,section,output,input')];
				runWithSignalOwner(clientOwner, () => client.route$.set('home'));
				root = hydrateRoot(container, client.Document, props, {
					signalOwner: clientOwner,
					onRecoverableError: (value) => recoverable.push(value),
				});
				await act(() => root!.render(client.Document, { ...props, when: condition(true) }));
				expect(committed).toEqual([
					observations('heading', 'thread', 'home'),
					observations('first', 'thread', 'home'),
					observations('second', 'thread', 'home'),
				]);
				expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
					'home',
					'home',
				]);
				expect([...container.querySelectorAll('main,h1,section,output,input')]).toEqual(hosts);
				expect(recoverable).toEqual([]);
			} finally {
				root?.unmount();
				expect(clientOwner.inspect().adoptionLeases).toBe(0);
				clientOwner.dispose();
				serverOwner.dispose();
				container.remove();
			}
		});

		it.each(['thread', 'streamed history'])(
			'adopts a streamed region with %s without reinitializing live document values',
			async (history) => {
				const { server, client } = fixture(dev);
				const serverOwner = createScope({ scopeKey: 'streamed-document' });
				const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
				const container = document.createElement('div');
				document.body.append(container);
				const ready = deferred<void>();
				const collector = createPipeableCollector();
				const committed: CommitObservation[] = [];
				const observe = (value: CommitObservation) => committed.push(value);
				const recoverable: unknown[] = [];
				let root: Root | undefined;
				let stream: ReturnType<typeof renderToPipeableStream> | undefined;
				try {
					runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
					const initialDocumentSignals = serverOwner.serialize();
					const props = { id: 'streamed', ready: ready.promise, when: condition(false), observe };
					stream = renderToPipeableStream(server.StreamedRegion, props, {
						signalOwner: serverOwner,
						initialDocumentSignals,
					});
					stream.pipe(collector.destination);
					await vi.waitFor(() =>
						expect(collector.chunks.join('')).toContain('Waiting for the region'),
					);
					runWithSignalOwner(serverOwner, () => server.route$.set(history));
					ready.resolve();
					container.innerHTML = await collector.ended;
					runWithSignalOwner(clientOwner, () => client.route$.set('live edit before placement'));
					activateStreamedMarkup(container);
					expect(runWithSignalOwner(clientOwner, () => client.route$.get())).toBe(
						'live edit before placement',
					);
					const hosts = [...container.querySelectorAll('article,section,output,input')];
					root = hydrateRoot(container, client.StreamedRegion, props, {
						signalOwner: clientOwner,
						initialDocumentSignals,
						onRecoverableError: (value) => recoverable.push(value),
					});
					await act(() =>
						root!.render(client.StreamedRegion, {
							...props,
							when: condition(true),
							observe,
						}),
					);
					expect(committed).toEqual([
						observations('streamed', history, 'live edit before placement'),
					]);
					expect(container.querySelector('output')!.textContent).toBe('live edit before placement');
					expect([...container.querySelectorAll('article,section,output,input')]).toEqual(hosts);
					expect(recoverable).toEqual([]);
				} finally {
					ready.resolve();
					stream?.abort();
					root?.unmount();
					expect(clientOwner.inspect().adoptionLeases).toBe(0);
					clientOwner.dispose();
					serverOwner.dispose();
					container.remove();
				}
			},
		);

		it.each([
			{ kind: 'malformed', late: false },
			{ kind: 'malformed', late: true },
			{ kind: 'mismatched', late: false },
			{ kind: 'mismatched', late: true },
		] as const)(
			'fails pipeable startup for a $kind document seed and releases abort handling (late pipe: $late)',
			async ({ kind, late }) => {
				const { server } = fixture(dev);
				const serverOwner = createScope({ scopeKey: 'failed-pipeable-document' });
				const outer = new AbortController();
				const added = vi.spyOn(outer.signal, 'addEventListener');
				const removed = vi.spyOn(outer.signal, 'removeEventListener');
				const producerDone = deferred<void>();
				const cancelProducer = vi.fn((_reason: unknown) => producerDone.resolve());
				const onError = vi.fn();
				const onShellError = vi.fn();
				const onShellReady = vi.fn();
				const onAllReady = vi.fn();
				const destination = { write: vi.fn(), end: vi.fn(), destroy: vi.fn() };
				let stream: ReturnType<typeof renderToPipeableStream> | undefined;
				try {
					runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
					stream = renderToPipeableStream(
						server.Document,
						{ when: condition(false) },
						{
							signalOwner: serverOwner,
							initialDocumentSignals: invalidSeed(serverOwner.serialize(), kind),
							signal: outer.signal,
							onError,
							onShellError,
							onShellReady,
							onAllReady,
							injection: {
								take: () => '<script data-producer>queued producer data</script>',
								subscribe: () => () => {},
								done: producerDone.promise,
								cancel: cancelProducer,
							},
						},
					);
					if (late) await vi.waitFor(() => expect(onShellError).toHaveBeenCalledOnce());
					expect(() => stream!.pipe(destination)).not.toThrow();
					await vi.waitFor(() => expect(onShellError).toHaveBeenCalledOnce());
					const failure = onShellError.mock.calls[0]![0];
					expect(failure).toBeInstanceOf(Error);
					expect(failure.message).toMatch(/initial document signals/i);
					expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
					expect(destination.destroy).toHaveBeenCalledExactlyOnceWith(failure);
					expect(destination.write).not.toHaveBeenCalled();
					expect(destination.end).not.toHaveBeenCalled();
					expect(onShellReady).not.toHaveBeenCalled();
					expect(onAllReady).not.toHaveBeenCalled();
					expect(cancelProducer).toHaveBeenCalledExactlyOnceWith(failure);
					const abortListener = added.mock.calls.find(([event]) => event === 'abort')?.[1];
					expect(abortListener).toBeDefined();
					expect(removed).toHaveBeenCalledWith('abort', abortListener);
					stream.abort(new Error('abort after failed startup'));
					outer.abort(new Error('outer abort after failed startup'));
					await Promise.resolve();
					expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
					expect(onShellError).toHaveBeenCalledExactlyOnceWith(failure);
					expect(cancelProducer).toHaveBeenCalledExactlyOnceWith(failure);
					expect(destination.destroy).toHaveBeenCalledExactlyOnceWith(failure);
					expect(serverOwner.inspect()).toMatchObject({ adoptionLeases: 0, activeRequests: 0 });
				} finally {
					stream?.abort();
					outer.abort();
					producerDone.resolve();
					added.mockRestore();
					removed.mockRestore();
					serverOwner.dispose();
				}
			},
		);

		it.each(['malformed', 'mismatched'] as const)(
			'rejects readable startup for a %s document seed and releases abort handling',
			async (kind) => {
				const { server } = fixture(dev);
				const serverOwner = createScope({ scopeKey: 'failed-readable-document' });
				const outer = new AbortController();
				const added = vi.spyOn(outer.signal, 'addEventListener');
				const removed = vi.spyOn(outer.signal, 'removeEventListener');
				const producerDone = deferred<void>();
				const cancelProducer = vi.fn((_reason: unknown) => producerDone.resolve());
				const onError = vi.fn();
				const onShellError = vi.fn();
				const onShellReady = vi.fn();
				const onAllReady = vi.fn();
				const successfulShell = vi.fn();
				const rejected = vi.fn();
				try {
					runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
					void renderToReadableStream(
						server.Document,
						{ when: condition(false) },
						{
							signalOwner: serverOwner,
							initialDocumentSignals: invalidSeed(serverOwner.serialize(), kind),
							signal: outer.signal,
							onError,
							onShellError,
							onShellReady,
							onAllReady,
							injection: {
								take: () => '<script data-producer>queued producer data</script>',
								subscribe: () => () => {},
								done: producerDone.promise,
								cancel: cancelProducer,
							},
						},
					).then(successfulShell, rejected);
					await vi.waitFor(() => expect(rejected).toHaveBeenCalledOnce());
					const failure = rejected.mock.calls[0]![0];
					expect(failure).toBeInstanceOf(Error);
					expect(failure.message).toMatch(/initial document signals/i);
					expect(successfulShell).not.toHaveBeenCalled();
					expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
					expect(onShellError).toHaveBeenCalledExactlyOnceWith(failure);
					expect(onShellReady).not.toHaveBeenCalled();
					expect(onAllReady).not.toHaveBeenCalled();
					expect(cancelProducer).toHaveBeenCalledExactlyOnceWith(failure);
					const abortListener = added.mock.calls.find(([event]) => event === 'abort')?.[1];
					expect(abortListener).toBeDefined();
					expect(removed).toHaveBeenCalledWith('abort', abortListener);
					outer.abort(new Error('outer abort after failed startup'));
					await Promise.resolve();
					expect(rejected).toHaveBeenCalledExactlyOnceWith(failure);
					expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
					expect(onShellError).toHaveBeenCalledExactlyOnceWith(failure);
					expect(cancelProducer).toHaveBeenCalledExactlyOnceWith(failure);
					expect(successfulShell).not.toHaveBeenCalled();
					expect(serverOwner.inspect()).toMatchObject({ adoptionLeases: 0, activeRequests: 0 });
				} finally {
					outer.abort();
					producerDone.resolve();
					added.mockRestore();
					removed.mockRestore();
					serverOwner.dispose();
				}
			},
		);

		it('keeps nested dormant history until its own activation and releases it on unmount', async () => {
			const { server, client } = fixture(dev);
			const serverOwner = createScope({ scopeKey: 'nested-document' });
			const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
			const container = document.createElement('div');
			document.body.append(container);
			const committed: CommitObservation[] = [];
			const cleaned: string[] = [];
			const recoverable: unknown[] = [];
			let root: Root | undefined;
			try {
				runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
				const initialDocumentSignals = serverOwner.serialize();
				const props = {
					when: interaction({ events: 'click' }),
					secondWhen: interaction({ events: 'click' }),
					nestedWhen: interaction({ events: 'click' }),
					observe: (value: CommitObservation) => committed.push(value),
					cleanup: (id: string) => cleaned.push(id),
				};
				container.innerHTML = renderToString(server.Document, props, {
					signalOwner: serverOwner,
					initialDocumentSignals,
				}).html;
				const hosts = [...container.querySelectorAll('main,h1,section,output,input')];
				runWithSignalOwner(clientOwner, () => client.route$.set('home'));
				root = hydrateRoot(container, client.Document, props, {
					signalOwner: clientOwner,
					initialDocumentSignals,
					onRecoverableError: (value) => recoverable.push(value),
				});
				await act(() => {
					container
						.querySelector('[data-reader="first"] > output')!
						.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				});
				expect(committed).toEqual([
					observations('heading', 'thread', 'home'),
					observations('first', 'thread', 'home'),
				]);
				expect(container.querySelector('[data-reader="first"] > output')!.textContent).toBe('home');
				expect(container.querySelector('[data-reader="nested"] > output')!.textContent).toBe(
					'thread',
				);
				await act(() => {
					container
						.querySelector('[data-reader="nested"] > output')!
						.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				});
				expect(committed.at(-1)).toEqual(observations('nested', 'thread', 'home'));
				expect(container.querySelector('[data-reader="nested"] > output')!.textContent).toBe(
					'home',
				);
				expect([...container.querySelectorAll('main,h1,section,output,input')]).toEqual(hosts);
				expect(recoverable).toEqual([]);
				root.unmount();
				root = undefined;
				expect(cleaned.sort()).toEqual(['first', 'heading', 'nested']);
				expect(clientOwner.inspect().adoptionLeases).toBe(0);
				expect(clientOwner.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
			} finally {
				root?.unmount();
				clientOwner.dispose();
				serverOwner.dispose();
				container.remove();
			}
		});

		it('releases dormant and suspended adoption when the root unmounts', async () => {
			const { server, client } = fixture(dev);
			const serverOwner = createScope({ scopeKey: 'released-document' });
			const clientOwner = createScope({ scopeKey: serverOwner.scopeKey });
			const container = document.createElement('div');
			document.body.append(container);
			const pending = deferred<void>();
			const committed: CommitObservation[] = [];
			const cleaned: string[] = [];
			const suspend = () => {
				throw pending.promise;
			};
			let root: Root | undefined;
			try {
				runWithSignalOwner(serverOwner, () => server.route$.set('thread'));
				const initialDocumentSignals = serverOwner.serialize();
				const props = {
					when: interaction({ events: 'click' }),
					secondWhen: interaction({ events: 'click' }),
					nestedWhen: condition(false),
					observe: (value: CommitObservation) => committed.push(value),
					cleanup: (id: string) => cleaned.push(id),
					suspend,
				};
				container.innerHTML = renderToString(
					server.Document,
					{ ...props, suspend: undefined },
					{
						signalOwner: serverOwner,
						initialDocumentSignals,
					},
				).html;
				root = hydrateRoot(container, client.Document, props, {
					signalOwner: clientOwner,
					initialDocumentSignals,
				});
				await act(() => {
					container
						.querySelector('[data-reader="first"] > output')!
						.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				});
				expect(committed.map((value) => value.id)).toEqual(['heading']);
				flushSync(() => root!.unmount());
				root = undefined;
				await act(() => pending.resolve());
				expect(cleaned).toEqual(['heading']);
				expect(container.childNodes).toHaveLength(0);
				expect(clientOwner.inspect()).toMatchObject({ adoptionLeases: 0, activeRequests: 0 });
				expect(clientOwner.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
				await act(() => runWithSignalOwner(clientOwner, () => client.route$.set('after unmount')));
				expect(container.childNodes).toHaveLength(0);
				expect(committed.map((value) => value.id)).toEqual(['heading']);
			} finally {
				pending.resolve();
				root?.unmount();
				clientOwner.dispose();
				serverOwner.dispose();
				container.remove();
			}
		});
	});
}
