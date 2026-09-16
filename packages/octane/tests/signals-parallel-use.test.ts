import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { hydrateRoot } from 'octane';
import { createScope } from 'octane/signals';
import * as signals from 'octane/signals';
import { prerender } from 'octane/static';
import { act, mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import { textTypeSourceVersion } from '../src/compiler/text-type-facts.js';
import * as client from './_fixtures/signals-parallel-use.tsrx';

const server = loadServerFixture<typeof client>(
	resolve(__dirname, '_fixtures/signals-parallel-use.tsrx'),
	{
		compileOptions: {},
		runtimeModules: {
			'octane/signals': signals,
			'octane/signals/query': signals,
			'octane/signals/derived': signals,
			'octane/signals/facade': signals,
		},
	},
);

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const drain = () => new Promise<void>((done) => setTimeout(done, 0));

describe('native reads in use() creations', () => {
	it.each([
		['root', client.NativeWarmParent],
		['boundary', client.NativeWarmBoundary],
	] as const)(
		'retains a refreshed warmed request through a %s first-mount retry',
		async (_kind, Parent) => {
			const scope = createScope({ scopeKey: 'native-warm-client-retry' });
			const count$ = scope.signal$('count', 1);
			const parent = deferred<string>();
			const requests: Array<{ value: number } & ReturnType<typeof deferred<string>>> = [];
			const make$ = () => {
				const request = { value: count$.get(), ...deferred<string>() };
				requests.push(request);
				return request.promise;
			};
			const rendered = mount(Parent, { make$, gate: () => parent.promise });
			try {
				expect(requests.map((request) => request.value)).toEqual([1]);
				count$.set(2);
				await act(() => parent.resolve('parent'));
				expect(requests.map((request) => request.value)).toEqual([1, 2]);
				await act(() => requests[1].resolve('current'));
				expect(rendered.find('.creation-value').textContent).toBe('current');
				expect(requests.map((request) => request.value)).toEqual([1, 2]);
			} finally {
				rendered.unmount();
				scope.dispose();
			}
		},
	);

	it('retains a root creation without a descendant warm plan', async () => {
		const scope = createScope({ scopeKey: 'native-root-creation-retry' });
		const count$ = scope.signal$('count', 1);
		const requests: Array<ReturnType<typeof deferred<string>>> = [];
		const make$ = () => {
			count$.get();
			const request = deferred<string>();
			requests.push(request);
			return request.promise;
		};
		const rendered = mount(client.NativeCreationValue, { make$ });
		try {
			expect(requests).toHaveLength(1);
			await act(() => requests[0].resolve('current'));
			expect(rendered.find('.creation-value').textContent).toBe('current');
			expect(requests).toHaveLength(1);
		} finally {
			rendered.unmount();
			scope.dispose();
		}
		for (const View of [
			client.ParallelJsxQueries,
			client.ParallelJsxText,
			client.ParallelJsxDerived,
			client.ParallelJsxConditional,
			client.ParallelJsxErrors,
			client.ParallelModule,
			client.ParallelQueries,
			client.ParallelDerived,
			client.ParallelNested,
			client.ParallelErrors,
			client.ParallelControlled,
			client.ParallelKeyed,
		]) {
			const first = deferred<string>();
			const second = deferred<string>();
			const started: string[] = [];
			const props = {
				load: (key: string) => {
					started.push(key);
					return key === 'first' ? first.promise : second.promise;
				},
			};
			client.parallelModule.load = props.load;
			const rendered = mount(View, props);
			try {
				expect(started).toEqual(['first', 'second']);
				await act(() => second.resolve('B'));
				expect(rendered.container.textContent).not.toContain('B');
				await act(() => first.resolve('A'));
				expect(rendered.find('.parallel-values').textContent).toBe('A:B');
				expect(started).toEqual(['first', 'second']);
			} finally {
				rendered.unmount();
				first.resolve('A');
				second.resolve('B');
			}
		}
		for (const View of [client.ParallelJsxConditional, client.ParallelJsxDeferred]) {
			const load = vi.fn(async (key: string) => key);
			const hidden = mount(View, { load, show: false });
			try {
				expect(hidden.find('.hidden').textContent).toBe('hidden');
				expect(load).not.toHaveBeenCalled();
			} finally {
				hidden.unmount();
			}
		}
		{
			const load = vi.fn(async (key: string) => key);
			const failure = new Error('setup failed');
			expect(() =>
				mount(client.ParallelJsxQueries, {
					load,
					before() {
						throw failure;
					},
				}),
			).toThrow(failure);
			expect(load).not.toHaveBeenCalled();
			const source = `import { query$ } from 'octane/signals'; export function Values(props) @{ const first$ = query$(() => 'first', props.load); const second$ = query$(() => 'second', props.load); <section><h2>{first$.get()}</h2><p>{second$.get()}</p></section> }`;
			const id = '/src/parallel-typed.tsrx';
			const second = source.indexOf('second$.get()');
			const typed = loadCompiledFixtureSource<{ Values: typeof client.ParallelJsxQueries }>(
				source,
				{
					id,
					mode: 'client',
					runtimeModules: { 'octane/signals': signals },
					compileOptions: {
						textTypeFacts: {
							version: 1,
							filename: id,
							sourceVersion: textTypeSourceVersion(source),
							projectVersion: 'parallel-test',
							stringChildRanges: [[second, second + 'second$.get()'.length]],
						},
					},
				},
			);
			const reached: string[] = [];
			expect(() =>
				mount(typed.Values, {
					load(key: string) {
						reached.push(key);
						throw failure;
					},
				}),
			).toThrow(failure);
			expect(reached).toEqual(['second']);
			const constructed: string[] = [];
			customElements.define(
				'octane-parallel-button',
				class extends HTMLButtonElement {
					constructor() {
						super();
						constructed.push('construct');
					}
				},
				{ extends: 'button' },
			);
			const customized = loadCompiledFixtureSource<{ Values: typeof client.ParallelJsxQueries }>(
				`import { query$ } from 'octane/signals'; export function Values(props) @{ const first$ = query$(() => 'first', props.load); const second$ = query$(() => 'second', props.load); <button IS="octane-parallel-button"><i>{first$.get()}</i><b>{second$.get()}</b></button> }`,
				{
					id: '/src/parallel-customized.tsrx',
					mode: 'client',
					runtimeModules: { 'octane/signals': signals },
				},
			);
			expect(() =>
				mount(customized.Values, {
					load(key: string) {
						constructed.push(key);
						throw failure;
					},
				}),
			).toThrow(failure);
			expect(constructed).toEqual(['construct', 'first']);
		}
		for (const View of [
			client.ParallelJsxAttribute,
			client.ParallelJsxCoercion,
			client.ParallelJsxMixed,
		]) {
			for (const callable of [false, true]) {
				const failure = new Error('first reachable failure');
				const reached: string[] = [];
				const read = () => {
					reached.push('coercion');
					throw failure;
				};
				const value = Object.assign(callable ? () => {} : {}, { toString: read });
				expect(() =>
					mount(View, {
						read,
						value,
						load: (key: string) => {
							reached.push(key);
							throw failure;
						},
					}),
				).toThrow(failure);
				expect(reached).toEqual([View === client.ParallelJsxMixed ? 'second' : 'coercion']);
			}
		}
		for (const [View, ServerView] of [
			[client.ParallelJsxQueries, server.ParallelJsxQueries],
			[client.ParallelJsxText, server.ParallelJsxText],
			[client.ParallelJsxConditional, server.ParallelJsxConditional],
			[client.ParallelQueries, server.ParallelQueries],
			[client.ParallelErrors, server.ParallelErrors],
		] as const) {
			for (const cancel of [false, true]) {
				const serverOwner = createScope({ scopeKey: 'parallel-hydration' });
				const clientOwner = createScope({ scopeKey: 'parallel-hydration' });
				const output = await prerender(
					ServerView,
					{ load: async (key: string) => key },
					{ signalOwner: serverOwner },
				);
				const container = document.createElement('div');
				container.innerHTML = output.html;
				document.body.append(container);
				const before = container.querySelector('.parallel-values');
				const first = deferred<string>();
				const second = deferred<string>();
				const started: string[] = [];
				const aborted: string[] = [];
				let root: ReturnType<typeof hydrateRoot> | undefined;
				try {
					root = hydrateRoot(
						container,
						View,
						{
							load: (key: string, context: { signal: AbortSignal }) => {
								started.push(key);
								context.signal.addEventListener('abort', () => aborted.push(key));
								return key === 'first' ? first.promise : second.promise;
							},
						},
						{ signalOwner: clientOwner },
					);
					expect(started).toEqual(['first', 'second']);
					expect(container.querySelector('.parallel-values')).toBe(before);
					if (cancel) {
						root.unmount();
						root = undefined;
						expect(aborted.sort()).toEqual(['first', 'second']);
					} else {
						await act(() => second.resolve('second'));
						expect(container.querySelector('.parallel-values')).toBe(before);
						await act(() => first.resolve('first'));
						expect(container.querySelector('.parallel-values')?.textContent).toBe('first:second');
						expect(started).toEqual(['first', 'second']);
					}
				} finally {
					root?.unmount();
					container.remove();
					serverOwner.dispose();
					clientOwner.dispose();
					first.resolve('first');
					second.resolve('second');
				}
			}
		}
		for (const View of [
			client.ParallelAuthSelectors,
			client.ParallelAuthLocal,
			client.ParallelJsxAuth,
		]) {
			const auth = deferred<string>();
			const conversation = deferred<string>();
			const history = deferred<string>();
			const started: string[] = [];
			const rendered = mount(View, {
				load: (key: string) => {
					started.push(key);
					return key === 'auth'
						? auth.promise
						: key === 'user:conversation'
							? conversation.promise
							: history.promise;
				},
			});
			try {
				expect(started).toEqual(
					View === client.ParallelAuthLocal ? ['user:conversation', 'user:history'] : ['auth'],
				);
				await act(() => auth.resolve('user'));
				expect(started).toEqual(
					View === client.ParallelAuthLocal
						? ['user:conversation', 'user:history']
						: ['auth', 'user:conversation', 'user:history'],
				);
				await act(() => {
					conversation.resolve('conversation');
					history.resolve('history');
				});
				expect(rendered.find('.parallel-values').textContent).toBe('conversation:history');
			} finally {
				rendered.unmount();
				auth.resolve('user');
				conversation.resolve('conversation');
				history.resolve('history');
			}
		}
		const started: string[] = [];
		const conditionalProps = {
			show: false,
			load: (key: string) => {
				started.push(key);
				return Promise.resolve(key);
			},
		};
		const conditional = mount(client.ParallelConditional, conditionalProps);
		try {
			expect(started).toEqual([]);
			conditional.update(client.ParallelConditional, { ...conditionalProps, show: true });
			await act(() => {});
			expect(started).toEqual(['first', 'second']);
			expect(conditional.find('.parallel-values').textContent).toBe('first:second');
		} finally {
			conditional.unmount();
		}
		// A pending replacement may disappear before claiming its retained owners.
		// Branch removal and raw-key replacement must retire those unused entries.
		const diagnosticSpy = vi.spyOn(console, 'error');
		try {
			for (const [keyed, boundary] of [
				[false, false],
				[true, false],
				[false, true],
				[true, true],
			]) {
				const View = boundary
					? client.ParallelLifetimeBoundary
					: keyed
						? client.ParallelKeyed
						: client.ParallelControlled;
				const pending: Array<
					ReturnType<typeof deferred<string>> & { key: string; aborted: boolean }
				> = [];
				const props = {
					keyed,
					show: false,
					keys: [] as string[],
					load: (key: string, context?: { signal: AbortSignal }) => {
						const request = { ...deferred<string>(), key, aborted: false };
						pending.push(request);
						context!.signal.addEventListener('abort', () => {
							request.aborted = true;
						});
						return request.promise;
					},
				};
				const replacement = mount(View, props);
				try {
					expect(pending).toHaveLength(0);
					replacement.update(View, { ...props, show: true, keys: ['old'] });
					await act(() => {});
					expect(pending.map((request) => request.key)).toEqual(['first', 'second']);
					replacement.update(View, { ...props, show: keyed, keys: keyed ? ['new'] : [] });
					await act(() => {});
					expect(
						pending.slice(0, 2).map((request) => request.aborted),
						`keyed=${keyed}, boundary=${boundary}`,
					).toEqual([true, true]);
					await act(() => {
						pending[0].resolve('obsolete-first');
						pending[1].resolve('obsolete-second');
					});
					expect(replacement.container.textContent).not.toContain('obsolete');
					if (!keyed) {
						expect(pending).toHaveLength(2);
						replacement.update(View, { ...props, show: true });
						await act(() => {});
					}
					expect(pending.map((request) => request.key)).toEqual([
						'first',
						'second',
						'first',
						'second',
					]);
					expect(pending.slice(2).map((request) => request.aborted)).toEqual([false, false]);
					await act(() => pending[3].resolve('current-second'));
					expect(replacement.container.textContent).not.toContain('current-second');
					await act(() => pending[2].resolve('current-first'));
					expect(replacement.find('.parallel-values').textContent).toBe(
						'current-first:current-second',
					);
					expect(pending).toHaveLength(4);
				} finally {
					replacement.unmount();
					for (const request of pending) request.resolve('cleanup');
				}
			}
			// A later suspended row must not discard a completed prefix, and its
			// same-key retry must claim the existing attempts rather than restart them.
			for (const boundary of [false, true]) {
				const View = boundary ? client.ParallelLifetimeBoundary : client.ParallelKeyed;
				const first = deferred<string>();
				const second = deferred<string>();
				const started: string[] = [];
				const aborted: number[] = [];
				const props = {
					keyed: true,
					show: true,
					keys: [] as string[],
					load: (key: string, context?: { signal: AbortSignal }) => {
						const index = started.length;
						started.push(key);
						context!.signal.addEventListener('abort', () => aborted.push(index));
						return index < 2
							? Promise.resolve('prefix-' + key)
							: key === 'first'
								? first.promise
								: second.promise;
					},
				};
				const rows = mount(View, props);
				try {
					rows.update(View, { ...props, keys: ['ready', 'pending'] });
					await act(() => {});
					expect(started, `prefix boundary=${boundary}`).toEqual([
						'first',
						'second',
						'first',
						'second',
					]);
					expect(aborted).toEqual([]);
					await act(() => second.resolve('row-second'));
					expect(started).toHaveLength(4);
					expect(aborted).toEqual([]);
					expect(rows.container.textContent).not.toContain('row-second');
					await act(() => first.resolve('row-first'));
					expect(
						Array.from(
							rows.container.querySelectorAll('.parallel-values'),
							(node) => node.textContent,
						),
					).toEqual(['prefix-first:prefix-second', 'row-first:row-second']);
					expect(started).toHaveLength(4);
					expect(aborted).toEqual([]);
				} finally {
					rows.unmount();
					first.resolve('cleanup');
					second.resolve('cleanup');
				}
			}
			// Native state can supersede a pending path without changing props/env.
			for (const keyed of [false, true]) {
				const owner = createScope({ scopeKey: 'native-pending-path' });
				const rows$ = owner.signal$<readonly string[]>('rows', []);
				const pending: Array<ReturnType<typeof deferred<string>> & { aborted: boolean }> = [];
				const view = mount(client.ParallelNativeLifetime, {
					keyed,
					rows$,
					load: (_key: string, context?: { signal: AbortSignal }) => {
						const request = { ...deferred<string>(), aborted: false };
						pending.push(request);
						context!.signal.addEventListener('abort', () => {
							request.aborted = true;
						});
						return request.promise;
					},
				});
				try {
					await act(() => rows$.set(['old']));
					expect(pending).toHaveLength(2);
					await act(() => rows$.set(keyed ? ['new'] : []));
					expect(
						pending.slice(0, 2).map((request) => request.aborted),
						`native keyed=${keyed}`,
					).toEqual([true, true]);
					await act(() => {
						pending[0].resolve('obsolete');
						pending[1].resolve('obsolete');
					});
					expect(view.container.textContent).not.toContain('obsolete');
					if (!keyed) await act(() => rows$.set(['new']));
					expect(pending).toHaveLength(4);
					await act(() => pending[3].resolve('current-second'));
					expect(pending).toHaveLength(4);
					await act(() => pending[2].resolve('current-first'));
					expect(view.find('.parallel-values').textContent).toBe('current-first:current-second');
				} finally {
					view.unmount();
					owner.dispose();
					for (const request of pending) request.resolve('cleanup');
				}
			}
			// Reordering a pending survivor keeps its attempts. If a new prefix
			// suspends before reading the suffix key, that survivor is still unknown,
			// not obsolete, and must remain alive until membership is observed.
			const reorderOwner = createScope({ scopeKey: 'native-pending-reorder' });
			const reorderedRows$ = reorderOwner.signal$<readonly string[]>('rows', []);
			const reorderedRequests: Array<
				ReturnType<typeof deferred<string>> & { key: string; aborted: boolean }
			> = [];
			const reordered = mount(client.ParallelNativeLifetime, {
				keyed: true,
				rows$: reorderedRows$,
				load: (key: string, context?: { signal: AbortSignal }) => {
					const request = { ...deferred<string>(), key, aborted: false };
					reorderedRequests.push(request);
					context!.signal.addEventListener('abort', () => {
						request.aborted = true;
					});
					if (reorderedRequests.length <= 2) request.resolve('ready-' + key);
					return request.promise;
				},
			});
			try {
				await act(() => reorderedRows$.set(['ready', 'survivor']));
				expect(reorderedRequests).toHaveLength(4);
				await act(() => reorderedRows$.set(['survivor', 'ready']));
				expect(reorderedRequests).toHaveLength(4);
				expect(reorderedRequests.slice(2).map((request) => request.aborted)).toEqual([
					false,
					false,
				]);
				await act(() => reorderedRows$.set(['new-prefix', 'survivor']));
				expect(reorderedRequests).toHaveLength(6);
				expect(reorderedRequests.slice(2).map((request) => request.aborted)).toEqual([
					false,
					false,
					false,
					false,
				]);
				await act(() => {
					reorderedRequests[4].resolve('new-first');
					reorderedRequests[5].resolve('new-second');
				});
				expect(reorderedRequests).toHaveLength(6);
				expect(reorderedRequests.slice(2, 4).map((request) => request.aborted)).toEqual([
					false,
					false,
				]);
				await act(() => reorderedRequests[3].resolve('surviving-second'));
				expect(reorderedRequests).toHaveLength(6);
				await act(() => reorderedRequests[2].resolve('surviving-first'));
				expect(
					Array.from(
						reordered.container.querySelectorAll('.parallel-values'),
						(node) => node.textContent,
					),
				).toEqual(['new-first:new-second', 'surviving-first:surviving-second']);
				expect(reorderedRequests).toHaveLength(6);
			} finally {
				reordered.unmount();
				reorderOwner.dispose();
				for (const request of reorderedRequests) request.resolve('cleanup');
			}
			expect(
				diagnosticSpy.mock.calls
					.flat()
					.filter(
						(message) =>
							typeof message === 'string' && message.includes('Cannot update a component'),
					),
			).toEqual([]);
		} finally {
			diagnosticSpy.mockRestore();
		}
		for (const View of [client.ParallelErrors, client.ParallelJsxErrors]) {
			const firstError = deferred<string>();
			const secondError = deferred<string>();
			const errors = mount(View, {
				load: (key: string) => (key === 'first' ? firstError.promise : secondError.promise),
			});
			try {
				await act(() => secondError.reject(new Error('later error')));
				expect(errors.find('.pending').textContent).toBe('loading');
				await act(() => firstError.reject(new Error('first error')));
				expect(errors.find('.error').textContent).toBe('first error');
			} finally {
				errors.unmount();
			}
			const failedStarts: string[] = [];
			const failed = mount(View, {
				load(key: string) {
					failedStarts.push(key);
					throw new Error('synchronous first error');
				},
			});
			try {
				expect(failedStarts).toEqual(['first']);
				expect(failed.find('.error').textContent).toBe('synchronous first error');
			} finally {
				failed.unmount();
			}
		}
		const cancellationStarts: string[] = [];
		const aborted: string[] = [];
		const cancelled = mount(client.ParallelQueries, {
			load: (key: string, context?: { signal: AbortSignal }) => {
				cancellationStarts.push(key);
				context!.signal.addEventListener('abort', () => aborted.push(key));
				return new Promise<string>(() => {});
			},
		});
		try {
			expect(cancellationStarts).toEqual(['first', 'second']);
		} finally {
			cancelled.unmount();
		}
		expect(aborted.sort()).toEqual(['first', 'second']);
	});

	it('refreshes a creation after unchanged props replayed its accepted value', async () => {
		const scope = createScope({ scopeKey: 'native-use-client' });
		const count$ = scope.signal$('count', 1);
		const make$ = () => Promise.resolve('value:' + count$.get());
		const rendered = mount(client.NativeCreationBoundary, { make$, label: 'before' });
		try {
			await act(() => {});
			expect(rendered.find('.creation-value').textContent).toBe('value:1');
			rendered.update(client.NativeCreationBoundary, { make$, label: 'after' });
			await act(() => count$.set(2));
			expect(rendered.find('.label').textContent).toBe('after');
			expect(rendered.find('.creation-value').textContent).toBe('value:2');
		} finally {
			rendered.unmount();
			scope.dispose();
		}
	});

	it('replaces a server creation whose native input changed during suspension', async () => {
		const scope = createScope({ scopeKey: 'native-use-server' });
		const count$ = scope.signal$('count', 1);
		const first = deferred<string>();
		const second = deferred<string>();
		const started: number[] = [];
		const make$ = () => {
			const value = count$.get();
			started.push(value);
			return value === 1 ? first.promise : second.promise;
		};
		try {
			const done = prerender(server.NativeCreationBoundary, { make$ });
			await drain();
			expect(started).toEqual([1]);
			count$.set(2);
			first.resolve('obsolete');
			await drain();
			expect(started).toEqual([1, 2]);
			second.resolve('current');
			const output = await done;
			expect(output.html).toContain('current');
			expect(output.html).not.toContain('obsolete');
			expect(started).toEqual([1, 2]);
		} finally {
			scope.dispose();
		}
		for (const [kind, View] of [
			['jsx-query', server.ParallelJsxQueries],
			['jsx-text', server.ParallelJsxText],
			['jsx-derived', server.ParallelJsxDerived],
			['jsx-conditional', server.ParallelJsxConditional],
			['query', server.ParallelQueries],
			['derived', server.ParallelDerived],
			['module', server.ParallelModule],
		] as const) {
			const first = deferred<string>();
			const second = deferred<string>();
			const started: string[] = [];
			const props = {
				load: (key: string) => {
					started.push(key);
					return key === 'first' ? first.promise : second.promise;
				},
			};
			server.parallelModule.load = props.load;
			// The client and server fixture share facade declarations in this jsdom
			// process. Give SSR its request owner, not the prior browser module cache.
			const owner = createScope({ scopeKey: 'parallel-server-' + kind });
			const done = prerender(View, props, { signalOwner: owner });
			try {
				await drain();
				expect(started, kind).toEqual(['first', 'second']);
			} finally {
				first.resolve('A');
				second.resolve('B');
				try {
					await done;
				} finally {
					owner.dispose();
				}
			}
			const markup = document.createElement('div');
			markup.innerHTML = (await done).html;
			expect(markup.querySelector('.parallel-values')?.textContent).toBe('A:B');
			expect(started).toEqual(['first', 'second']);
		}
		for (const View of [
			server.ParallelAuthSelectors,
			server.ParallelAuthLocal,
			server.ParallelJsxAuth,
		]) {
			const auth = deferred<string>();
			const conversation = deferred<string>();
			const history = deferred<string>();
			const started: string[] = [];
			const done = prerender(View, {
				load: (key: string) => {
					started.push(key);
					return key === 'auth'
						? auth.promise
						: key === 'user:conversation'
							? conversation.promise
							: history.promise;
				},
			});
			try {
				await drain();
				expect(started).toEqual(
					View === server.ParallelAuthLocal ? ['user:conversation', 'user:history'] : ['auth'],
				);
				auth.resolve('user');
				await drain();
				expect(started).toEqual(
					View === server.ParallelAuthLocal
						? ['user:conversation', 'user:history']
						: ['auth', 'user:conversation', 'user:history'],
				);
			} finally {
				auth.resolve('user');
				conversation.resolve('conversation');
				history.resolve('history');
				await done;
			}
			const markup = document.createElement('div');
			markup.innerHTML = (await done).html;
			expect(markup.querySelector('.parallel-values')?.textContent).toBe('conversation:history');
		}
		for (const View of [server.ParallelJsxConditional, server.ParallelJsxDeferred]) {
			const load = vi.fn(async (key: string) => key);
			expect((await prerender(View, { load, show: false })).html).toContain('hidden');
			expect(load).not.toHaveBeenCalled();
		}
		{
			const load = vi.fn(async (key: string) => key);
			const failure = new Error('setup failed');
			await expect(
				prerender(server.ParallelJsxQueries, {
					load,
					before() {
						throw failure;
					},
				}),
			).rejects.toBe(failure);
			expect(load).not.toHaveBeenCalled();
		}
		for (const View of [
			server.ParallelJsxAttribute,
			server.ParallelJsxCoercion,
			server.ParallelJsxMixed,
		]) {
			for (const callable of [false, true]) {
				const failure = new Error('first reachable failure');
				const reached: string[] = [];
				const read = () => {
					reached.push('coercion');
					throw failure;
				};
				const value = Object.assign(callable ? () => {} : {}, { toString: read });
				await expect(
					prerender(View, {
						read,
						value,
						load: (key: string) => {
							reached.push(key);
							throw failure;
						},
					}),
				).rejects.toBe(failure);
				expect(reached).toEqual([
					View === server.ParallelJsxAttribute
						? 'first'
						: View === server.ParallelJsxMixed
							? 'first'
							: 'coercion',
				]);
			}
		}
		const conditionalStarts: string[] = [];
		const conditional = await prerender(server.ParallelConditional, {
			show: false,
			load: (key: string) => {
				conditionalStarts.push(key);
				return Promise.resolve(key);
			},
		});
		expect(conditionalStarts).toEqual([]);
		expect(conditional.html).toContain('hidden');
		for (const View of [server.ParallelErrors, server.ParallelJsxErrors]) {
			const firstError = deferred<string>();
			const secondError = deferred<string>();
			let completed = false;
			const errors = prerender(View, {
				load: (key: string) => (key === 'first' ? firstError.promise : secondError.promise),
			});
			void errors.then(() => {
				completed = true;
			});
			await drain();
			secondError.reject(new Error('later error'));
			await drain();
			expect(completed).toBe(false);
			firstError.reject(new Error('first error'));
			expect((await errors).html).toContain('first error');
			expect((await errors).html).not.toContain('later error');
			const failedStarts: string[] = [];
			const failed = await prerender(View, {
				load: (key: string) => {
					failedStarts.push(key);
					throw new Error('synchronous first error');
				},
			});
			expect(failedStarts).toEqual(['first']);
			expect(failed.html).toContain('synchronous first error');
		}
	});

	it('rechecks a warmed descendant before adopting it into final server markup', async () => {
		const scope = createScope({ scopeKey: 'native-warm-server' });
		const count$ = scope.signal$('count', 1);
		const parent = deferred<string>();
		const started: number[] = [];
		const make$ = () => {
			const value = count$.get();
			started.push(value);
			return Promise.resolve('child:' + value);
		};
		try {
			const done = prerender(server.NativeWarmParent, { make$, gate: () => parent.promise });
			await drain();
			expect(started).toEqual([1]);
			count$.set(2);
			parent.resolve('parent');
			const output = await done;
			expect(output.html).toContain('child:2');
			expect(output.html).not.toContain('child:1');
			expect(started).toEqual([1, 2]);
		} finally {
			scope.dispose();
		}
	});
});
