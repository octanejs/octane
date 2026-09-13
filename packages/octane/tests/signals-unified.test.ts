import { afterEach, describe, expect, it } from 'vitest';
import {
	__derivedAt,
	__queryAt,
	__signalAt,
	ActionUncertainError,
	acceptStreamedSignalResult,
	action$,
	attachStreamedSignalResult,
	createScope,
	isSignalHandle,
	isWritableSignal,
	optimistic$,
	query,
	retireSignalOwnerIdentity,
	runWithSignalOwner,
	SignalStreamError,
	skip,
	type Scope,
	type ActionOperation,
	type DerivedContext,
} from 'octane/signals';
import {
	controlledStream,
	deferred,
	drainProducers,
	nextSnapshot$,
} from './_fixtures/signals-async-controls';

const scopes: Scope[] = [];

function owner(key: string): Scope {
	const scope = createScope({ scopeKey: key });
	scopes.push(scope);
	return scope;
}

afterEach(() => {
	for (const scope of scopes.splice(0)) scope.dispose();
});

describe('owner-bound module signal declarations', () => {
	it('declares without an owner and resolves distinct writable cells per owner', () => {
		const count$ = __signalAt('module.ts#count', 1);
		expect(isSignalHandle(count$)).toBe(true);
		expect(isWritableSignal(count$)).toBe(true);
		expect(() => count$.get()).toThrow(/signal owner/i);

		const first = owner('document:first');
		const second = owner('document:second');
		runWithSignalOwner(first, () => count$.set(2));
		expect(runWithSignalOwner(first, () => count$.get())).toBe(2);
		expect(runWithSignalOwner(second, () => count$.get())).toBe(1);
	});

	it('shares globals by document and isolates repeated instance declarations', () => {
		const documentOwner = { scopeKey: 'document:shared' };
		const firstInstance = {
			scopeKey: 'renderer:first',
			documentOwner,
			instanceOwner: {},
			instanceKey: 'todos:first',
		};
		const secondInstance = {
			scopeKey: 'renderer:second',
			documentOwner,
			instanceOwner: {},
			instanceKey: 'todos:second',
		};
		const global$ = __signalAt('g:module-global', 0);
		const firstLocal$ = __signalAt('i:factory-local', 1);
		const repeatedFirstLocal$ = __signalAt('i:factory-local', 99);
		const secondLocal$ = __signalAt('i:factory-local', 2);

		runWithSignalOwner(firstInstance, () => {
			global$.set(3);
			firstLocal$.set(4);
			expect(repeatedFirstLocal$.get()).toBe(4);
		});
		runWithSignalOwner(secondInstance, () => {
			expect(global$.get()).toBe(3);
			expect(secondLocal$.get()).toBe(2);
		});

		retireSignalOwnerIdentity(firstInstance);
		expect(() => runWithSignalOwner(firstInstance, () => firstLocal$.get())).toThrow(
			/has been disposed/,
		);
		expect(runWithSignalOwner(secondInstance, () => global$.get())).toBe(3);
		retireSignalOwnerIdentity(documentOwner);
		expect(() => runWithSignalOwner(secondInstance, () => global$.get())).toThrow(
			/has been disposed/,
		);
		expect(() => runWithSignalOwner(secondInstance, () => secondLocal$.get())).toThrow(
			/has been disposed/,
		);
		retireSignalOwnerIdentity(secondInstance);
	});

	it('keeps function values as writable state rather than computations', () => {
		const initial = () => 'initial';
		const next = () => 'next';
		const handler$ = __signalAt('module.ts#handler', initial);
		const scope = owner('document:function-value');

		runWithSignalOwner(scope, () => {
			expect(handler$.get()).toBe(initial);
			handler$.set(() => next);
			expect(handler$.get()).toBe(next);
		});
	});
});

describe('unified readonly derived declarations', () => {
	it('cancels a local pending attempt read without canceling its foreign producer', async () => {
		const foreign = owner('document:foreign-pending-read');
		const local = owner('document:local-pending-read');
		const producer = deferred<string>();
		let producerSignal!: AbortSignal;
		const load = query('foreign-pending-read', (_argument: undefined, { signal }) => {
			producerSignal = signal;
			return producer.promise;
		});
		const source$ = foreign.asyncSignal$('source', () => load(undefined));
		let context!: DerivedContext;
		let settled = false;
		const value$ = __derivedAt('local-pending-read', (current) => {
			context = current;
			return current.read(source$).finally(() => {
				settled = true;
			});
		});
		runWithSignalOwner(local, () => expect(value$.snapshot().status).toBe('pending'));
		const signal = context.signal;
		local.dispose();
		await drainProducers();
		expect(settled).toBe(true);
		expect(signal.aborted).toBe(true);
		expect(context.signal.aborted).toBe(true);
		await expect(context.read(source$)).rejects.toThrow(/no longer active/);
		expect(producerSignal.aborted).toBe(false);
		expect(source$.snapshot().status).toBe('pending');
		producer.resolve('foreign still current');
		await drainProducers();
		expect(source$.get()).toBe('foreign still current');
	});

	it('keeps the synchronous path immediate and readonly', () => {
		const count$ = __signalAt('module.ts#source', 2);
		const doubled$ = __derivedAt('module.ts#doubled', () => count$.get() * 2);
		const scope = owner('document:sync-derived');

		runWithSignalOwner(scope, () => {
			expect(doubled$.get()).toBe(4);
			expect(isWritableSignal(doubled$)).toBe(false);
			count$.set(3);
			expect(doubled$.get()).toBe(6);
		});
	});

	it('fences a promise attempt when an attempt-bound read changes after await', async () => {
		const selected$ = __signalAt('module.ts#selected', 'first');
		const gates = [deferred<void>(), deferred<void>()];
		const results = [deferred<string>(), deferred<string>()];
		const attempts: AbortSignal[] = [];
		let run = 0;
		const value$ = __derivedAt('module.ts#async', async ({ read, signal }) => {
			const attempt = run++;
			attempts.push(signal);
			await gates[attempt].promise;
			const selected = await read(selected$);
			return `${selected}:${await results[attempt].promise}`;
		});
		const scope = owner('document:async-derived');

		runWithSignalOwner(scope, () => expect(scope.isPending(() => value$.get())).toBe(true));
		gates[0].resolve();
		await drainProducers();
		runWithSignalOwner(scope, () => selected$.set('second'));
		expect(attempts[0].aborted).toBe(true);
		gates[1].resolve();
		results[0].resolve('obsolete');
		results[1].resolve('accepted');
		await drainProducers();
		expect(runWithSignalOwner(scope, () => value$.get())).toBe('second:accepted');
		expect(runWithSignalOwner(scope, () => value$.snapshot())).toMatchObject({
			status: 'ready',
			connection: 'none',
			complete: true,
		});
	});

	it('publishes stream yields and closes an obsolete iterator', async () => {
		const selected$ = __signalAt('module.ts#stream-selected', 'first');
		const first = controlledStream<string>();
		const second = controlledStream<string>();
		const stream$ = __derivedAt('module.ts#stream', ({ read }) => ({
			async *[Symbol.asyncIterator]() {
				const selected = await read(selected$);
				for await (const value of selected === 'first' ? first.iterable : second.iterable) {
					yield `${selected}:${value}`;
				}
			},
		}));
		const scope = owner('document:stream-derived');

		runWithSignalOwner(scope, () => stream$.snapshot());
		first.emit('one');
		await runWithSignalOwner(scope, () =>
			nextSnapshot$(stream$, (snapshot) => snapshot.status === 'ready'),
		);
		expect(runWithSignalOwner(scope, () => stream$.get())).toBe('first:one');
		runWithSignalOwner(scope, () => selected$.set('second'));
		await drainProducers();
		expect(first.cancellations).toBe(1);
		second.emit('two');
		await drainProducers();
		expect(runWithSignalOwner(scope, () => stream$.get())).toBe('second:two');
		expect(runWithSignalOwner(scope, () => stream$.snapshot())).toMatchObject({
			status: 'ready',
			connection: 'open',
			complete: false,
		});
		second.end();
		await drainProducers();
		expect(runWithSignalOwner(scope, () => stream$.snapshot())).toMatchObject({
			status: 'ready',
			value: 'second:two',
			connection: 'closed',
			complete: true,
		});
	});

	it('unwraps a promised async iterable before publishing stream values', async () => {
		const stream = controlledStream<string>();
		const stream$ = __derivedAt<string>('g:promised-stream', async () => stream.iterable);
		const prefix$ = __derivedAt('g:promised-stream-prefix', async () =>
			stream$.get().toUpperCase(),
		);
		const explicit$ = __derivedAt('g:promised-stream-explicit', async ({ read }) =>
			(await read(stream$)).toUpperCase(),
		);
		const scope = owner('document:promised-stream');

		runWithSignalOwner(scope, () => stream$.snapshot());
		await drainProducers();
		stream.emit('value');
		await drainProducers();
		expect(runWithSignalOwner(scope, () => stream$.snapshot())).toMatchObject({
			status: 'ready',
			value: 'value',
			connection: 'open',
			complete: false,
		});
		runWithSignalOwner(scope, () => {
			prefix$.snapshot();
			explicit$.snapshot();
		});
		await drainProducers();
		expect(runWithSignalOwner(scope, () => [prefix$.snapshot(), explicit$.snapshot()])).toEqual([
			expect.objectContaining({
				status: 'ready',
				value: 'VALUE',
				connection: 'open',
				complete: false,
			}),
			expect.objectContaining({
				status: 'ready',
				value: 'VALUE',
				connection: 'open',
				complete: false,
			}),
		]);
		stream.end();
		await drainProducers();
		for (const handle$ of [stream$, prefix$, explicit$]) {
			expect(runWithSignalOwner(scope, () => handle$.snapshot())).toMatchObject({
				status: 'ready',
				connection: 'closed',
				complete: true,
			});
		}
	});
});

describe('keyed query declarations', () => {
	it('represents skip as idle and distinguishes quiet refetch from reset', async () => {
		const selected$ = __signalAt<string | typeof skip>('module.ts#query-selected', skip);
		const completions = [
			deferred<string>(),
			deferred<string>(),
			deferred<string>(),
			deferred<string>(),
		];
		let starts = 0;
		const value$ = __queryAt(
			'module.ts#query',
			() => selected$.get(),
			(_selected: string) => completions[starts++].promise,
		);
		const scope = owner('document:query');
		const projected$ = __derivedAt('module.ts#query-projected', () => value$.get().toUpperCase());
		const synchronous$ = __derivedAt(
			'module.ts#query-synchronous',
			() => value$.get().toUpperCase(),
			{
				sync: true,
			},
		);

		expect(runWithSignalOwner(scope, () => value$.snapshot())).toMatchObject({ status: 'idle' });
		runWithSignalOwner(scope, () => selected$.set('first'));
		expect(runWithSignalOwner(scope, () => scope.isPending(() => value$.get()))).toBe(true);
		expect(
			runWithSignalOwner(scope, () => [projected$.snapshot(), synchronous$.snapshot()]),
		).toEqual([
			expect.objectContaining({ status: 'pending' }),
			expect.objectContaining({ status: 'pending' }),
		]);
		completions[0].resolve('ready');
		await drainProducers();
		expect(runWithSignalOwner(scope, () => value$.get())).toBe('ready');
		for (const handle$ of [projected$, synchronous$]) {
			expect(runWithSignalOwner(scope, () => handle$.get())).toBe('READY');
		}

		runWithSignalOwner(scope, () => value$.refetch());
		expect(runWithSignalOwner(scope, () => value$.snapshot())).toMatchObject({
			status: 'ready',
			value: 'ready',
			refreshing: true,
		});
		for (const handle$ of [projected$, synchronous$]) {
			expect(runWithSignalOwner(scope, () => handle$.snapshot())).toMatchObject({
				status: 'ready',
				value: 'READY',
				refreshing: true,
				complete: false,
			});
		}
		completions[1].resolve('refetched');
		await drainProducers();
		for (const handle$ of [projected$, synchronous$]) {
			expect(runWithSignalOwner(scope, () => handle$.get())).toBe('REFETCHED');
		}

		runWithSignalOwner(scope, () => value$.reset());
		expect(runWithSignalOwner(scope, () => value$.snapshot())).toMatchObject({ status: 'pending' });
		for (const handle$ of [projected$, synchronous$]) {
			expect(runWithSignalOwner(scope, () => handle$.snapshot())).toMatchObject({
				status: 'pending',
			});
			expect(runWithSignalOwner(scope, () => handle$.latest(null))).toBe('REFETCHED');
		}
		completions[2].resolve('reset');
		await drainProducers();
		expect(runWithSignalOwner(scope, () => value$.get())).toBe('reset');
		for (const handle$ of [projected$, synchronous$]) {
			expect(runWithSignalOwner(scope, () => handle$.get())).toBe('RESET');
		}
		runWithSignalOwner(scope, () => selected$.set('failure'));
		const failure = new Error('The source failed.');
		completions[3].reject(failure);
		await drainProducers();
		for (const handle$ of [projected$, synchronous$]) {
			expect(runWithSignalOwner(scope, () => handle$.snapshot())).toMatchObject({
				status: 'error',
				error: failure,
			});
			expect(() => runWithSignalOwner(scope, () => handle$.get())).toThrow(failure);
		}
	});

	it('adopts a buffered initial result once and fetches later selections in the browser', async () => {
		const documentOwner = { scopeKey: 'document:streamed-query' };
		const rendererOwner = {
			scopeKey: 'renderer:streamed-query',
			documentOwner,
			instanceOwner: {},
			instanceKey: 'todos.main',
		};
		const identity = {
			protocol: 1 as const,
			buildId: 'test-build',
			documentId: 'test-document',
			ownerKey: documentOwner.scopeKey,
			instanceKey: rendererOwner.instanceKey,
			nodeKey: 'g:streamed-query',
			selectionKey: JSON.stringify(['g:streamed-query', ['string', 'one']]),
			selectionGeneration: 1,
			attempt: 1,
		};
		let starts = 0;
		let consumer:
			| {
					accept(frame: Parameters<typeof acceptStreamedSignalResult>[1]): void;
					fail(error: { code: string }): void;
			  }
			| undefined;
		const detach = attachStreamedSignalResult(
			{
				attachResult(_identity, attached) {
					consumer = attached;
					return () => {
						consumer = undefined;
					};
				},
			},
			rendererOwner,
			identity,
		);
		consumer!.accept({
			identity,
			sequence: 0,
			channel: 'result',
			kind: 'open',
			resource: 'promise',
		});
		consumer!.accept({
			identity,
			sequence: 1,
			channel: 'result',
			kind: 'value',
			value: ['string', 'server'],
		});
		consumer!.accept({
			identity,
			sequence: 2,
			channel: 'result',
			kind: 'complete',
		});
		const selected$ = __signalAt('g:streamed-selected', 'one');
		const value$ = __queryAt(
			'g:streamed-query',
			() => selected$.get(),
			() => {
				starts++;
				return Promise.resolve('browser');
			},
		);

		expect(starts).toBe(0);
		expect(runWithSignalOwner(rendererOwner, () => value$.get())).toBe('server');
		expect(runWithSignalOwner(rendererOwner, () => value$.snapshot()).complete).toBe(true);
		expect(
			acceptStreamedSignalResult(rendererOwner, {
				identity: { ...identity, selectionGeneration: 0 },
				sequence: 3,
				channel: 'result',
				kind: 'complete',
			}),
		).toBe(false);
		detach();
		runWithSignalOwner(rendererOwner, () => selected$.set('two'));
		await drainProducers();
		expect(runWithSignalOwner(rendererOwner, () => value$.get())).toBe('browser');
		runWithSignalOwner(rendererOwner, () => selected$.set('one'));
		await drainProducers();
		expect(starts).toBe(2);
		expect(runWithSignalOwner(rendererOwner, () => value$.get())).toBe('browser');

		retireSignalOwnerIdentity(documentOwner);
		expect(
			acceptStreamedSignalResult(rendererOwner, {
				identity,
				sequence: 3,
				channel: 'result',
				kind: 'complete',
			}),
		).toBe(false);
	});

	it('settles a pre-activation channel failure as a local signal error', () => {
		const documentOwner = { scopeKey: 'document:stream-failure' };
		const rendererOwner = {
			scopeKey: 'renderer:stream-failure',
			documentOwner,
			instanceOwner: {},
			instanceKey: 'todos.failure',
		};
		const identity = {
			protocol: 1 as const,
			buildId: 'test-build',
			documentId: 'test-document',
			ownerKey: documentOwner.scopeKey,
			instanceKey: rendererOwner.instanceKey,
			nodeKey: 'g:failed-query',
			selectionKey: JSON.stringify(['g:failed-query', ['string', 'one']]),
			selectionGeneration: 1,
			attempt: 1,
		};
		let fail!: (error: { code: string }) => void;
		attachStreamedSignalResult(
			{
				attachResult(_identity, consumer) {
					fail = consumer.fail;
					return () => {};
				},
			},
			rendererOwner,
			identity,
		);
		fail({ code: 'timeout' });
		const value$ = __queryAt(
			'g:failed-query',
			() => 'one',
			() => Promise.resolve('browser'),
		);

		expect(() => runWithSignalOwner(rendererOwner, () => value$.get())).toThrow(SignalStreamError);
		retireSignalOwnerIdentity(documentOwner);
	});
});

describe('optimistic actions', () => {
	it('does not discard uncertain intent when rejecting during a pure read is forbidden', () => {
		const scope = owner('document:pure-rejection');
		const source$ = __signalAt('g:pure-rejection', 'old');
		const visible$ = optimistic$(source$);
		let operation!: ActionOperation;
		const save = action$('pure-rejection', (op) => {
			operation = op;
			visible$.set('tentative');
			return op.uncertain();
		});
		runWithSignalOwner(scope, () => save());
		const rejected$ = __derivedAt('g:reject-in-read', () => {
			operation.reject();
			return true;
		});
		expect(() => runWithSignalOwner(scope, () => rejected$.get())).toThrow(/write|pure|comput/i);
		expect(operation.status).toBe('uncertain');
		runWithSignalOwner(scope, () => source$.set('fresh'));
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('tentative');
		operation.reject();
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('fresh');
	});

	it('does not confirm an A operation from B authority', async () => {
		const scope = owner('document:until-selection');
		const selected$ = __signalAt('g:until-selected', 'a');
		const source$ = __queryAt(
			'g:until-query',
			() => selected$.get(),
			async (key) => key === 'b',
		);
		const visible$ = optimistic$(source$);
		let operation!: ActionOperation;
		const save = action$('until-pinned', async (op) => {
			operation = op;
			visible$.set(true);
			await op.until(() => visible$.get());
		});
		runWithSignalOwner(scope, () => source$.snapshot());
		await drainProducers();
		const result = runWithSignalOwner(scope, () => save()).then(
			() => 'confirmed',
			(error) => error,
		);
		runWithSignalOwner(scope, () => selected$.set('b'));
		await drainProducers();
		expect(await result).toMatchObject({ message: expect.stringMatching(/selection/) });
		expect(operation.status).toBe('rejected');
		expect(runWithSignalOwner(scope, () => source$.get())).toBe(true);
	});

	it.each(['adopt', 'reject'] as const)(
		'explicitly reconciles uncertain intent by %s without dispatching again',
		async (outcome) => {
			const scope = owner(`document:reconcile-${outcome}`);
			const source$ = __signalAt('g:reconcile', 'old');
			const visible$ = optimistic$(source$);
			let operation!: ActionOperation;
			let calls = 0;
			const save = action$('reconcile', (op) => {
				operation = op;
				visible$.set('tentative');
				calls++;
				return op.uncertain();
			});
			const receipt = runWithSignalOwner(scope, () => save());
			expect(receipt.operationId).toBe(operation.id);
			runWithSignalOwner(scope, () => source$.set('authoritative'));
			expect(runWithSignalOwner(scope, () => visible$.get())).toBe('tentative');
			if (outcome === 'adopt') operation.adopt('accepted');
			else operation.reject();
			expect(operation.status).toBe(outcome === 'adopt' ? 'confirmed' : 'rejected');
			expect(runWithSignalOwner(scope, () => visible$.get())).toBe(
				outcome === 'adopt' ? 'accepted' : 'authoritative',
			);
			expect(calls).toBe(1);
			expect(() => operation.adopt('late')).toThrow(/settled/);
		},
	);

	it('stops an outstanding confirmation wait on a definitive rejection', async () => {
		const scope = owner('document:until-rejected');
		const visible$ = optimistic$(__signalAt('g:until-rejected', false));
		let operation!: ActionOperation;
		let outcome: unknown;
		const save = action$('until-rejected', async (op) => {
			operation = op;
			visible$.set(true);
			await op.until(() => visible$.get());
		});
		const pending = runWithSignalOwner(scope, () => save()).catch((error) => {
			outcome = error;
		});
		operation.reject();
		await drainProducers();
		expect(outcome).toBeInstanceOf(Error);
		await pending;
	});

	it.each(['switch', 'reselect', 'retire'] as const)(
		'fences uncertain adoption after %s and allows overlay cleanup',
		async (change) => {
			const scope = owner(`document:uncertain-${change}`);
			const selected$ = __signalAt(`g:uncertain-selected-${change}`, 'a');
			const source$ = __queryAt(
				`g:uncertain-source-${change}`,
				() => selected$.get(),
				async (key) => `server-${key}`,
			);
			const visible$ = optimistic$(source$);
			let operation!: ActionOperation;
			const save = action$('fenced-receipt', (op) => {
				operation = op;
				visible$.set('tentative-a');
				return op.uncertain();
			});
			runWithSignalOwner(scope, () => source$.snapshot());
			await drainProducers();
			runWithSignalOwner(scope, () => save());
			if (change === 'retire') scope.dispose();
			else {
				runWithSignalOwner(scope, () => selected$.set('b'));
				await drainProducers();
				if (change === 'reselect') {
					runWithSignalOwner(scope, () => selected$.set('a'));
					await drainProducers();
				}
			}
			expect(() => operation.adopt('wrong')).toThrow(/selection|disposed/);
			operation.reject();
			expect(operation.status).toBe('rejected');
			if (change !== 'retire')
				expect(runWithSignalOwner(scope, () => visible$.get())).toBe(
					change === 'switch' ? 'server-b' : 'server-a',
				);
		},
	);

	it('keeps a selected watch live after adopting an action receipt', async () => {
		const stream = controlledStream<string>();
		const scope = owner('document:action-watch');
		const source$ = __queryAt(
			'g:action-watch',
			() => 'one',
			() => stream.iterable,
			{ kind: 'stream' },
		);
		const visible$ = optimistic$(source$);
		const save = action$('watch-adopt', (operation) => {
			visible$.set('optimistic');
			operation.adopt('accepted');
		});
		runWithSignalOwner(scope, () => source$.snapshot());
		stream.emit('before');
		await drainProducers();
		runWithSignalOwner(scope, () => save());
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('accepted');
		expect(stream.cancellations).toBe(0);
		stream.emit('completed');
		await drainProducers();
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('completed');
		stream.end();
		await drainProducers();
		expect(runWithSignalOwner(scope, () => source$.snapshot()).complete).toBe(true);
	});

	it('removes only the rejected concurrent operation overlay', async () => {
		const source$ = __signalAt('g:optimistic-source', 0);
		const visible$ = optimistic$(source$);
		const first = deferred<void>();
		const second = deferred<void>();
		const fail = action$('first', async () => {
			visible$.set((value) => value + 1);
			await first.promise;
			throw new Error('rejected');
		});
		const succeed = action$('second', async () => {
			visible$.set((value) => value + 10);
			await second.promise;
		});
		const scope = owner('document:optimistic');

		const failed = runWithSignalOwner(scope, () => fail());
		const succeeded = runWithSignalOwner(scope, () => succeed());
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe(11);
		first.resolve();
		await expect(failed).rejects.toThrow('rejected');
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe(11);
		second.resolve();
		await succeeded;
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe(0);
	});

	it('retains uncertain intent and reports a distinct operation id without retrying', async () => {
		const source$ = __signalAt('g:uncertain-source', 'saved');
		const visible$ = optimistic$(source$);
		let calls = 0;
		const save = action$('save', async () => {
			visible$.set('draft');
			calls++;
			throw Object.freeze({ code: 'OCTANE_RPC_UNCERTAIN' });
		});
		const scope = owner('document:uncertain');

		const error = await runWithSignalOwner(scope, () => save()).catch((caught) => caught);
		expect(error).toBeInstanceOf(ActionUncertainError);
		expect(error.operationId).toMatch(/^save:/);
		expect(calls).toBe(1);
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('draft');
	});

	it('adopts authority only into the pinned query selection', async () => {
		const initial = deferred<string>();
		const selected$ = __signalAt('g:action-selected', 'one');
		const source$ = __queryAt(
			'g:action-query',
			() => selected$.get(),
			() => initial.promise,
		);
		const visible$ = optimistic$(source$);
		const response = deferred<string>();
		const save = action$('adopt', async (operation) => {
			visible$.set('draft');
			operation.adopt(await response.promise);
		});
		const scope = owner('document:action-adopt');

		runWithSignalOwner(scope, () => source$.snapshot());
		initial.resolve('old');
		await drainProducers();
		const pending = runWithSignalOwner(scope, () => save());
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('draft');
		response.resolve('authoritative');
		await pending;
		expect(runWithSignalOwner(scope, () => source$.get())).toBe('authoritative');
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('authoritative');
	});

	it('lets an explicit operation pin its first optimistic write after await', async () => {
		const source$ = __signalAt('g:late-optimistic-source', 1);
		const visible$ = optimistic$(source$);
		const gate = deferred<void>();
		const update = action$('late-write', async (operation) => {
			await gate.promise;
			operation.set(visible$, 2);
			return operation.uncertain();
		});
		const scope = owner('document:late-optimistic');
		const pending = runWithSignalOwner(scope, () => update());

		gate.resolve();
		await pending;
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe(2);
	});

	it('does not let an optimistic value confirm its own operation.until predicate', async () => {
		const source$ = __signalAt('g:until-source', 1);
		const visible$ = optimistic$(source$);
		const waiting = deferred<void>();
		const save = action$('until-authority', async (operation) => {
			visible$.set(2);
			waiting.resolve();
			await operation.until(() => visible$.get() === 2);
		});
		const scope = owner('document:until-authority');
		let settled = false;
		const pending = runWithSignalOwner(scope, () => save()).then(() => {
			settled = true;
		});

		await waiting.promise;
		await drainProducers();
		expect(settled).toBe(false);
		runWithSignalOwner(scope, () => source$.set(2));
		await pending;
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe(2);
	});

	it('does not resurrect an uncertain overlay after an A to B to A reselection', async () => {
		const selected$ = __signalAt('g:overlay-selection', 'a');
		const responses = [deferred<string>(), deferred<string>(), deferred<string>()];
		let starts = 0;
		const source$ = __queryAt(
			'g:overlay-query',
			() => selected$.get(),
			() => responses[starts++].promise,
		);
		const visible$ = optimistic$(source$);
		const save = action$('uncertain-a', (operation) => {
			visible$.set('draft-a');
			return operation.uncertain();
		});
		const scope = owner('document:overlay-selection');

		runWithSignalOwner(scope, () => source$.snapshot());
		responses[0].resolve('server-a-1');
		await drainProducers();
		runWithSignalOwner(scope, () => save());
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('draft-a');

		runWithSignalOwner(scope, () => selected$.set('b'));
		responses[1].resolve('server-b');
		await drainProducers();
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('server-b');
		runWithSignalOwner(scope, () => selected$.set('a'));
		responses[2].resolve('server-a-2');
		await drainProducers();
		expect(runWithSignalOwner(scope, () => visible$.get())).toBe('server-a-2');
	});
});
