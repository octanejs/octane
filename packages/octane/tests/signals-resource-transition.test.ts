import { describe, expect, it } from 'vitest';
import { act, createRoot, flushSync, startTransition } from 'octane';
import {
	createResource,
	createScope,
	query,
	type DerivedCompute,
	type DerivedContext,
	type QueryContext,
	type WritableSignal,
} from 'octane/signals';
import { deferred } from './_fixtures/signals-async-controls.js';
import {
	DerivedPresentation,
	Presentation,
	RedeclaredResource,
} from './_fixtures/signals-resource-transition.tsrx';

describe('pending presentation in signal transitions', () => {
	it('restarts observation after a watched cleanup unmounts the root replacing its reader', async () => {
		const scope = createScope({ scopeKey: 'reentrant-reader-replacement' });
		const selected$ = scope.signal$(null, 'A');
		const host = document.createElement('div');
		const root = createRoot(host);
		const log: string[] = [];
		const value$ = scope.signal$(null, 'outgoing', {
			watched() {
				log.push('start');
				return () => {
					log.push('stop');
					root.unmount();
				};
			},
		});
		try {
			await act(() => root.render(Presentation, { selected$, value$, read: 'get' }));
			expect(host.querySelector('output')?.textContent).toBe('outgoing');
			await act(() => root.render(Presentation, { selected$, value$: selected$, read: 'get' }));
			expect(log).toEqual(['start', 'stop']);
			const release = value$.subscribe(() => {});
			expect(log).toEqual(['start', 'stop', 'start']);
			release();
			expect(log).toEqual(['start', 'stop', 'start', 'stop']);
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	it('catches up when the first committed watcher writes synchronously', async () => {
		const scope = createScope({ scopeKey: 'watched-commit-write' });
		const selected$ = scope.signal$('selected', 'A');
		const log: string[] = [];
		let value$!: WritableSignal<string>;
		value$ = scope.signal$('value', 'Ada', {
			watched: () => {
				log.push('watch');
				value$.set('Lin');
				return () => log.push('unwatch');
			},
		});
		const host = document.createElement('div');
		const root = createRoot(host);
		try {
			await act(() => root.render(Presentation, { selected$, value$, read: 'get' }));
			expect(host.querySelector('output')?.textContent).toBe('Lin');
			expect(log).toEqual(['watch']);
		} finally {
			root.unmount();
			scope.dispose();
		}
		expect(log).toEqual(['watch', 'unwatch']);
	});

	it.each(['commit', 'cancel'] as const)(
		'keeps watched dependencies connected until a suspended transition can %s',
		async (outcome) => {
			const pending = deferred<string>();
			const scope = createScope({ scopeKey: `watched-transition-${outcome}` });
			const log: string[] = [];
			const watched = (name: string) => () => {
				log.push(`watch ${name}`);
				return () => log.push(`unwatch ${name}`);
			};
			const selected$ = scope.signal$('selected', 'A');
			const left$ = scope.signal$('left', 'left', { watched: watched('left') });
			const right$ = scope.signal$('right', 'right', { watched: watched('right') });
			const lookup = query(`watched-transition-${outcome}`, (key: string) =>
				key === 'A' ? 'ready' : pending.promise,
			);
			const barrier$ = createResource(scope, 'barrier', () => lookup(selected$.get()));
			const value$ = scope.derived$('picked', () => {
				const value = (selected$.get() === 'A' ? left$ : right$).get();
				barrier$.get();
				return value;
			});
			const host = document.createElement('div');
			const root = createRoot(host);
			try {
				await act(() => {});
				await act(() => root.render(Presentation, { selected$, value$, read: 'get' }));
				expect(host.querySelector('output')?.textContent).toBe('left');
				expect([...log]).toEqual(['watch left']);
				await act(() => startTransition(() => selected$.set('B')));
				expect(host.querySelector('output')?.textContent).toBe('left');
				expect([...log]).toEqual(['watch left']);

				if (outcome === 'commit') {
					await act(() => pending.resolve('ready'));
					expect(host.querySelector('output')?.textContent).toBe('right');
					expect([...log].sort()).toEqual(['unwatch left', 'watch left', 'watch right'].sort());
				} else {
					await act(() => startTransition(() => selected$.set('A')));
					await act(() => pending.resolve('ready'));
					expect(host.querySelector('output')?.textContent).toBe('left');
					expect([...log]).toEqual(['watch left']);
				}
			} finally {
				root.unmount();
				scope.dispose();
			}
			expect([...log].sort()).toEqual(
				(outcome === 'commit'
					? ['watch left', 'unwatch left', 'watch right', 'unwatch right']
					: ['watch left', 'unwatch left']
				).sort(),
			);
		},
	);

	it('preserves a newer accepted selection when an older Action settles', async () => {
		const gate = deferred<void>();
		const pendingB = deferred<string>();
		const pendingC = deferred<string>();
		const requests: { key: string; signal: AbortSignal }[] = [];
		const scope = createScope({ scopeKey: 'resource-transition-selection-authority' });
		const selected$ = scope.signal$('selected', 'A');
		const load = (key: string, { signal }: QueryContext<string>) => {
			requests.push({ key, signal });
			return key === 'A' ? 'ready-A' : key === 'B' ? pendingB.promise : pendingC.promise;
		};
		const host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		const props = { selected$, load, gate: gate.promise };
		try {
			await act(() => root.render(RedeclaredResource, props));
			expect(host.querySelector('output')?.textContent).toBe('ready-A');
			await act(() => host.querySelector('button')!.click());
			expect(requests.map(({ key }) => key)).toEqual(['A', 'B']);
			flushSync(() => root.render(RedeclaredResource, { ...props, selection: 'C' }));
			expect(requests.map(({ key }) => key)).toEqual(['A', 'B', 'C']);
			await act(() => gate.resolve());
			expect(selected$.get()).toBe('B');
			expect(requests.slice(1).map(({ signal }) => signal.aborted)).toEqual([true, false]);
			await act(() => pendingC.resolve('ready-C'));
			expect(host.querySelector('output')?.textContent).toBe('ready-C');
		} finally {
			gate.resolve();
			root.unmount();
			scope.dispose();
			host.remove();
		}
	});

	it('preserves a request read by the synchronous transition callback', async () => {
		const pending = deferred<string>();
		const requests: { key: string; signal: AbortSignal }[] = [];
		const scope = createScope({ scopeKey: 'resource-transition-action' });
		const selected$ = scope.signal$('selected', 'A');
		const lookup = query('resource-transition-action', (key: string, { signal }) => {
			requests.push({ key, signal });
			return key === 'A' ? 'ready-A' : pending.promise;
		});
		const resource$ = createResource(scope, 'result', () => lookup(selected$.get()));
		try {
			await act(() =>
				startTransition(() => {
					selected$.set('B');
					expect(resource$.snapshot().status).toBe('pending');
				}),
			);
			expect(requests.map(({ key }) => key)).toEqual(['A', 'B']);
			expect(requests[1]!.signal.aborted).toBe(false);
			await act(() => pending.resolve('ready-B'));
			expect(resource$.get()).toBe('ready-B');
		} finally {
			scope.dispose();
		}
	});

	it.each(['snapshot', 'latest', 'get'] as const)(
		'preserves the selected request for a %s read',
		async (read) => {
			const pending = deferred<string>();
			const requests: { key: string; signal: AbortSignal }[] = [];
			const scope = createScope({ scopeKey: `resource-transition-${read}` });
			const selected$ = scope.signal$('selected', 'A');
			const lookup = query(`resource-transition-${read}`, (key: string, { signal }) => {
				requests.push({ key, signal });
				return key === 'A' ? 'ready-A' : pending.promise;
			});
			const resource$ = createResource(scope, 'result', () => lookup(selected$.get()));
			const host = document.createElement('div');
			document.body.append(host);
			const root = createRoot(host);
			try {
				await act(() => root.render(Presentation, { selected$, value$: resource$, read }));
				expect(resource$.get()).toBe('ready-A');
				await act(() => startTransition(() => selected$.set('B')));
				expect(requests.map(({ key }) => key)).toEqual(['A', 'B']);
				expect(requests[1]!.signal.aborted).toBe(false);
				expect(selected$.get()).toBe(read === 'get' ? 'A' : 'B');
				expect(host.querySelector('b')?.textContent).toBe(read === 'get' ? 'A' : 'B');
				expect(host.querySelector('output')?.textContent).toBe(
					read === 'snapshot' ? 'pending' : 'ready-A',
				);
				await act(() => pending.resolve('ready-B'));
				expect(host.querySelector('b')?.textContent).toBe('B');
				expect(host.querySelector('output')?.textContent).toBe(
					read === 'snapshot' ? 'ready' : 'ready-B',
				);
				expect(resource$.get()).toBe('ready-B');
				expect(requests.map(({ key }) => key)).toEqual(['A', 'B']);
			} finally {
				root.unmount();
				scope.dispose();
				host.remove();
			}
		},
	);

	it.each([
		['synchronous', 'get'],
		['synchronous', 'snapshot'],
		['asynchronous', 'snapshot'],
	] as const)('owns a request through a %s derived %s presentation', async (kind, read) => {
		const pending = deferred<string>();
		const requests: AbortSignal[] = [];
		const scope = createScope({ scopeKey: `derived-request-${kind}-${read}` });
		const selected$ = scope.signal$('selected', 'A');
		const lookup = query(`derived-request-${kind}-${read}`, (key: string, { signal }) => {
			if (key === 'A') return 'ready-A';
			requests.push(signal);
			return pending.promise;
		});
		const resource$ = createResource(scope, 'resource', () => lookup(selected$.get()));
		const host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		try {
			if (kind === 'synchronous') {
				const value$ = scope.derived$('value', () => resource$.get());
				await act(() => root.render(Presentation, { selected$, value$, read }));
			} else {
				const compute$: DerivedCompute<string> = ({ read: read$ }) => read$(resource$);
				await act(() => root.render(DerivedPresentation, { selected$, compute$, read }));
			}
			await act(() => startTransition(() => selected$.set('B')));
			expect(requests).toHaveLength(1);
			expect(requests[0]!.aborted).toBe(false);
			expect(host.querySelector('output')?.textContent).toBe(
				read === 'get' ? 'ready-A' : 'pending',
			);
			if (read === 'get') {
				await act(() => root.render(() => 'replacement'));
				expect(host.textContent).toBe('replacement');
				expect(selected$.get()).toBe('B');
				expect(requests[0]!.aborted).toBe(true);
				expect(requests).toHaveLength(1);
			} else {
				await act(() => pending.resolve('ready-B'));
				expect(host.querySelector('output')?.textContent).toBe('ready');
				expect(requests[0]!.aborted).toBe(false);
			}
		} finally {
			root.unmount();
			scope.dispose();
			host.remove();
		}
	});

	it.each(['snapshot', 'latest', 'get'] as const)(
		'preserves an async derived attempt and its explicit dependency for a %s read',
		async (read) => {
			const pending = deferred<string>();
			const attempts: { key: string; signal: AbortSignal }[] = [];
			const scope = createScope({ scopeKey: `derived-transition-${read}` });
			const selected$ = scope.signal$('selected', 'A');
			const compute$: DerivedCompute<string> = async ({ signal, read: read$ }) => {
				const key = await read$(selected$);
				attempts.push({ key, signal });
				return key === 'A' ? 'ready-A' : pending.promise;
			};
			const host = document.createElement('div');
			document.body.append(host);
			const root = createRoot(host);
			try {
				await act(() => root.render(DerivedPresentation, { selected$, compute$, read }));
				await act(() => startTransition(() => selected$.set('B')));
				expect(attempts.map(({ key }) => key)).toEqual(['A', 'B']);
				expect(attempts[1]!.signal.aborted).toBe(false);
				expect(host.querySelector('b')?.textContent).toBe(read === 'get' ? 'A' : 'B');
				expect(host.querySelector('output')?.textContent).toBe(
					read === 'snapshot' ? 'pending' : 'ready-A',
				);
				await act(() => pending.resolve('ready-B'));
				expect(host.querySelector('b')?.textContent).toBe('B');
				expect(host.querySelector('output')?.textContent).toBe(
					read === 'snapshot' ? 'ready' : 'ready-B',
				);
				expect(attempts.map(({ key }) => key)).toEqual(['A', 'B']);
			} finally {
				root.unmount();
				scope.dispose();
				host.remove();
			}
		},
	);

	it('keeps a promoted async attempt through a later accepted redeclaration', async () => {
		const pending = deferred<string>();
		const attempts: { key: string; signal: AbortSignal }[] = [];
		const scope = createScope({ scopeKey: 'derived-transition-redeclaration' });
		const selected$ = scope.signal$('selected', 'A');
		const compute$: DerivedCompute<string> = ({ signal }) => {
			const key = selected$.get();
			attempts.push({ key, signal });
			return key === 'A' ? 'ready-A' : pending.promise;
		};
		const host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		try {
			await act(() => root.render(DerivedPresentation, { selected$, compute$, read: 'snapshot' }));
			await act(() => startTransition(() => selected$.set('B')));
			expect(attempts.map(({ key }) => key)).toEqual(['A', 'B']);
			expect(host.querySelector('output')?.textContent).toBe('pending');
			await act(() =>
				root.render(DerivedPresentation, {
					selected$,
					compute$: (context: DerivedContext) => compute$(context),
					read: 'snapshot',
				}),
			);
			expect(attempts.map(({ key }) => key)).toEqual(['A', 'B']);
			expect(attempts[1]!.signal.aborted).toBe(false);
			await act(() => pending.resolve('ready-B'));
			expect(host.querySelector('output')?.textContent).toBe('ready');
		} finally {
			root.unmount();
			scope.dispose();
			host.remove();
		}
	});

	it('keeps an accepted computed thenable attached to its canonical node', async () => {
		const pending = deferred<void>();
		const scope = createScope({ scopeKey: 'computed-transition-wakeup' });
		const selected$ = scope.signal$('selected', 'A');
		let ready = false;
		const value$ = scope.derived$('value', () => {
			if (selected$.get() === 'A') return 'ready-A';
			if (!ready) throw pending.promise;
			return 'ready-B';
		});
		const host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		try {
			await act(() => root.render(Presentation, { selected$, value$, read: 'snapshot' }));
			await act(() => startTransition(() => selected$.set('B')));
			expect(host.querySelector('output')?.textContent).toBe('pending');
			ready = true;
			await act(() => pending.resolve(undefined));
			expect(host.querySelector('output')?.textContent).toBe('ready');
			expect(value$.get()).toBe('ready-B');
		} finally {
			root.unmount();
			scope.dispose();
			host.remove();
		}
	});

	it.each([false, true])(
		'releases an accepted request according to its remaining leases (shared=%s)',
		async (shared) => {
			const pending = deferred<string>();
			const requests: { key: string; signal: AbortSignal }[] = [];
			const scope = createScope({ scopeKey: `request-lease-${shared}` });
			const selected$ = scope.signal$('selected', 'A');
			const lookup = query(`request-lease-${shared}`, (key: string, { signal }) => {
				requests.push({ key, signal });
				return key === 'B' ? pending.promise : `ready-${key}`;
			});
			const value$ = createResource(scope, 'value', () => lookup(selected$.get()));
			const host = document.createElement('div');
			document.body.append(host);
			const root = createRoot(host);
			try {
				await act(() => root.render(Presentation, { selected$, value$, read: 'snapshot' }));
				await act(() => startTransition(() => selected$.set('B')));
				const sibling$ = shared ? createResource(scope, 'sibling', () => lookup('B')) : undefined;
				if (sibling$) expect(sibling$.snapshot().status).toBe('pending');
				await act(() => startTransition(() => selected$.set('C')));
				expect(requests.map(({ key }) => key)).toEqual(['A', 'B', 'C']);
				expect(requests[1]!.signal.aborted).toBe(!shared);
				expect(value$.get()).toBe('ready-C');
				await act(() => pending.resolve('ready-B'));
				if (sibling$) expect(sibling$.get()).toBe('ready-B');
				expect(value$.get()).toBe('ready-C');
			} finally {
				root.unmount();
				scope.dispose();
				host.remove();
			}
		},
	);
});
