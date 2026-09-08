import { afterEach, describe, expect, it } from 'vitest';
import { createScope, query, ScopeDisposedError, type Resource, type Scope } from 'octane/signals';
import {
	capturePending$,
	controlledStream,
	deferred,
	drainProducers,
	nextSnapshot$,
} from './_fixtures/signals-async-controls';

const owners: Scope[] = [];
function owner(key = `streams-${owners.length}`): Scope {
	const scope = createScope({ scopeKey: key });
	owners.push(scope);
	return scope;
}

afterEach(() => {
	for (const scope of owners.splice(0)) scope.dispose();
});

describe('scoped stream resources', () => {
	it.each(['retry', 'selection'] as const)(
		'does not start more work when iterator cleanup retires its owner during %s',
		async (operation) => {
			const scope = owner(`retire-in-return-${operation}`);
			const selected$ = scope.signal$('selected', 'a');
			const stream = controlledStream<string>({ onReturn: () => scope.dispose() });
			const signals: AbortSignal[] = [];
			const load = query(
				'return-retires-owner',
				(_id: string, { signal }) => {
					signals.push(signal);
					return stream.iterable;
				},
				{ kind: 'stream' },
			);
			const resource$ = scope.asyncSignal$('resource', () => load(selected$.get()));
			await stream.started;
			if (operation === 'retry') resource$.retry();
			else selected$.set('b');
			expect(signals.map((signal) => signal.aborted)).toEqual([true]);
			expect(scope.inspect()).toMatchObject({ retired: true, activeRequests: 0, nodes: [] });
			expect(() => resource$.get()).toThrow(ScopeDisposedError);
		},
	);

	it('keeps the nested retry selected when iterator cleanup retries synchronously', async () => {
		const scope = owner('retry-in-return');
		let resource$!: Resource<string>;
		const first = controlledStream<string>({ onReturn: () => resource$.retry() });
		const second = controlledStream<string>();
		const signals: AbortSignal[] = [];
		const load = query(
			'return-retries',
			(_argument: undefined, { signal }) => {
				signals.push(signal);
				return signals.length === 1 ? first.iterable : second.iterable;
			},
			{ kind: 'stream' },
		);
		resource$ = scope.asyncSignal$('resource', () => load(undefined));
		await first.started;
		resource$.retry();
		expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
		await second.started;
		const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		second.emit('nested current');
		await ready;
		expect(resource$.get()).toBe('nested current');
		scope.dispose();
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		expect(second.cancellations).toBe(1);
	});

	it('separates connection, readiness, successive values, and normal completion', async () => {
		const scope = owner();
		const stream = controlledStream<string>();
		const load = query('messages', () => stream.iterable, { kind: 'stream' });
		const messages$ = scope.asyncSignal$('messages', () => load(undefined));
		expect(messages$.snapshot()).toMatchObject({
			status: 'pending',
			connection: 'connecting',
			complete: false,
			refreshing: false,
		});
		expect(messages$.latest('fallback')).toBe('fallback');
		expect(scope.isPending(() => messages$.get())).toBe(true);
		const wakeup = capturePending$(() => messages$.get());
		const first = nextSnapshot$(messages$, (snapshot) => snapshot.status === 'ready');
		stream.emit('first');
		await first;
		await wakeup;
		expect(messages$.snapshot()).toMatchObject({
			status: 'ready',
			value: 'first',
			connection: 'open',
			complete: false,
			refreshing: false,
		});
		expect(scope.isPending(() => messages$.get())).toBe(false);
		const second = nextSnapshot$(
			messages$,
			(snapshot) => snapshot.status === 'ready' && snapshot.value === 'second',
		);
		stream.emit('second');
		await second;
		expect(messages$.get()).toBe('second');
		const completed = nextSnapshot$(messages$, (snapshot) => snapshot.complete);
		stream.end();
		await completed;
		expect(messages$.snapshot()).toMatchObject({
			status: 'ready',
			value: 'second',
			connection: 'closed',
			complete: true,
			refreshing: false,
		});
		expect(messages$.latest('fallback')).toBe('second');
	});

	it.each([undefined, null, '', false, 0])(
		'treats a yielded %j as a usable value',
		async (value) => {
			const scope = owner();
			const stream = controlledStream<typeof value>();
			const load = query('empty-yield', () => stream.iterable, { kind: 'stream' });
			const resource$ = scope.asyncSignal$('resource', () => load(undefined));
			const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
			stream.emit(value);
			await ready;
			expect(resource$.get()).toBe(value);
			expect(resource$.latest('fallback')).toBe(value);
			expect(scope.isPending(() => resource$.get())).toBe(false);
			const completed = nextSnapshot$(resource$, (snapshot) => snapshot.complete);
			stream.end();
			await completed;
			expect(resource$.snapshot()).toMatchObject({
				status: 'ready',
				value,
				connection: 'closed',
				complete: true,
			});
		},
	);

	it('reports empty completion as an error rather than inventing a ready value', async () => {
		const scope = owner();
		const stream = controlledStream<string>();
		const load = query('empty-stream', () => stream.iterable, { kind: 'stream' });
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		const wakeup = capturePending$(() => resource$.get());
		const failed = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'error');
		stream.end();
		await failed;
		await wakeup;
		expect(resource$.snapshot()).toMatchObject({
			status: 'error',
			connection: 'closed',
			complete: false,
		});
		expect(() => resource$.get()).toThrow(/without yielding/);
		expect(() => scope.isPending(() => resource$.get())).toThrow(/without yielding/);
		expect(resource$.latest('fallback')).toBe('fallback');
		expect(stream.cancellations).toBe(1);
	});

	it.each([false, true])(
		'keeps a producer failure visible after an earlier yield=%s',
		async (hasValue) => {
			const scope = owner();
			const stream = controlledStream<string>();
			const load = query('stream-failure', () => stream.iterable, { kind: 'stream' });
			const resource$ = scope.asyncSignal$('resource', () => load(undefined));
			if (hasValue) {
				const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
				stream.emit('retained');
				await ready;
			}
			const failure = new Error('producer failed');
			const failed = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'error');
			stream.fail(failure);
			await failed;
			expect(resource$.snapshot()).toMatchObject({
				status: 'error',
				error: failure,
				connection: 'closed',
				complete: false,
			});
			expect(resource$.latest('fallback')).toBe(hasValue ? 'retained' : 'fallback');
			expect(() => resource$.get()).toThrow(failure);
			expect(() => scope.isPending(() => resource$.get())).toThrow(failure);
			expect(stream.cancellations).toBe(1);
			scope.dispose();
			expect(stream.cancellations).toBe(1);
		},
	);

	it.each(['yield', 'reject', 'end'] as const)(
		'closes a replaced stream and ignores its late %s',
		async (completion) => {
			const scope = owner();
			const selected$ = scope.signal$('selected', 'a');
			const streams = { a: controlledStream<string>(), b: controlledStream<string>() };
			const signals = new Map<string, AbortSignal>();
			const load = query(
				'selected-stream',
				(id: keyof typeof streams, { signal }) => {
					signals.set(id, signal);
					return streams[id].iterable;
				},
				{ kind: 'stream' },
			);
			const resource$ = scope.asyncSignal$('resource', () =>
				load(selected$.get() as keyof typeof streams),
			);
			const first = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
			streams.a.emit('a value');
			await first;
			const observed: string[] = [];
			resource$.subscribe(() => {
				const snapshot = resource$.snapshot();
				if (snapshot.status === 'ready') observed.push(snapshot.value);
			});
			selected$.set('b');
			expect(resource$.snapshot()).toMatchObject({ status: 'pending', connection: 'connecting' });
			expect(resource$.latest('fallback')).toBe('a value');
			expect(signals.get('a')?.aborted).toBe(true);
			expect(streams.a.cancellations).toBe(1);
			if (completion === 'yield') streams.a.emit('obsolete a');
			else if (completion === 'reject') streams.a.fail(new Error('obsolete a failure'));
			else streams.a.end();
			await drainProducers();
			expect(resource$.snapshot().status).toBe('pending');
			expect(resource$.latest('fallback')).toBe('a value');
			const second = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
			streams.b.emit('b value');
			await second;
			expect(resource$.get()).toBe('b value');
			expect(observed).toEqual(['b value']);
		},
	);

	it.each([false, true])(
		'retries a live stream with pending=%s without accepting obsolete yields',
		async (pending) => {
			const scope = owner();
			const attempts: ReturnType<typeof controlledStream<string>>[] = [];
			const signals: AbortSignal[] = [];
			const load = query(
				'stream-retry',
				(_argument: undefined, { signal }) => {
					const stream = controlledStream<string>();
					attempts.push(stream);
					signals.push(signal);
					return stream.iterable;
				},
				{ kind: 'stream' },
			);
			const resource$ = scope.asyncSignal$('resource', () => load(undefined));
			const first = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
			attempts[0].emit('retained');
			await first;
			resource$.retry({ pending });
			expect(resource$.snapshot()).toMatchObject(
				pending
					? { status: 'pending', connection: 'connecting', refreshing: false, complete: false }
					: {
							status: 'ready',
							value: 'retained',
							connection: 'connecting',
							refreshing: true,
							complete: false,
						},
			);
			expect(resource$.latest('fallback')).toBe('retained');
			expect(scope.isPending(() => resource$.get())).toBe(pending);
			expect(signals[0].aborted).toBe(true);
			expect(attempts[0].cancellations).toBe(1);
			attempts[0].emit('obsolete');
			await drainProducers();
			expect(resource$.latest('fallback')).toBe('retained');
			const refreshed = nextSnapshot$(
				resource$,
				(snapshot) => snapshot.status === 'ready' && !snapshot.refreshing,
			);
			attempts[1].emit('refreshed');
			await refreshed;
			expect(resource$.snapshot()).toMatchObject({
				status: 'ready',
				value: 'refreshed',
				connection: 'open',
				refreshing: false,
				complete: false,
			});
		},
	);

	it('does not count an old retained value as a yield from an empty retry', async () => {
		const scope = owner();
		const attempts: ReturnType<typeof controlledStream<string>>[] = [];
		const load = query(
			'empty-retry',
			() => {
				const stream = controlledStream<string>();
				attempts.push(stream);
				return stream.iterable;
			},
			{ kind: 'stream' },
		);
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		const first = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		attempts[0].emit('retained');
		await first;
		resource$.retry();
		const failed = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'error');
		attempts[1].end();
		await failed;
		expect(() => resource$.get()).toThrow(/without yielding/);
		expect(resource$.latest('fallback')).toBe('retained');
		expect(resource$.snapshot().complete).toBe(false);
	});

	it('shares one stream until its last resource changes selection', async () => {
		const scope = owner();
		const firstId$ = scope.signal$('first-id', 'a');
		const secondId$ = scope.signal$('second-id', 'a');
		const streams = { a: controlledStream<string>(), b: controlledStream<string>() };
		const starts: string[] = [];
		const load = query(
			'shared-stream',
			({ id }: { id: keyof typeof streams }) => {
				starts.push(id);
				return streams[id].iterable;
			},
			{ kind: 'stream' },
		);
		const first$ = scope.asyncSignal$('first', () =>
			load({ id: firstId$.get() as keyof typeof streams }),
		);
		const second$ = scope.asyncSignal$('second', () =>
			load({ id: secondId$.get() as keyof typeof streams }),
		);
		const ready = Promise.all(
			[first$, second$].map((resource$) =>
				nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready'),
			),
		);
		expect(starts).toEqual(['a']);
		streams.a.emit('shared a');
		await ready;
		expect([first$.get(), second$.get()]).toEqual(['shared a', 'shared a']);
		firstId$.set('b');
		expect(streams.a.cancellations).toBe(0);
		expect(second$.get()).toBe('shared a');
		secondId$.set('b');
		expect(starts).toEqual(['a', 'b']);
		expect(streams.a.cancellations).toBe(1);
		const changed = Promise.all(
			[first$, second$].map((resource$) =>
				nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready'),
			),
		);
		streams.b.emit('shared b');
		await changed;
		expect([first$.get(), second$.get()]).toEqual(['shared b', 'shared b']);
		scope.dispose();
		expect(streams.b.cancellations).toBe(1);
	});

	it('does not cancel a data-owned stream when its last public subscription stops', async () => {
		const scope = owner();
		const stream = controlledStream<string>();
		let signal: AbortSignal | undefined;
		const load = query(
			'subscription-lifetime',
			(_argument: undefined, context) => {
				signal = context.signal;
				return stream.iterable;
			},
			{ kind: 'stream' },
		);
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		const observed: unknown[] = [];
		const stop = resource$.subscribe(() => observed.push(resource$.snapshot()));
		await stream.started;
		stop();
		stop();
		expect(stream.cancellations).toBe(0);
		expect(signal?.aborted).toBe(false);
		stream.emit('still owned');
		await drainProducers();
		expect(resource$.get()).toBe('still owned');
		expect(observed).toEqual([]);
		scope.dispose();
		expect(stream.cancellations).toBe(1);
		expect(signal?.aborted).toBe(true);
	});

	it.each(['yield', 'reject', 'end'] as const)(
		'retires a stream silently before an abort-ignoring producer can %s',
		async (completion) => {
			const scope = owner();
			const stream = controlledStream<string>();
			let signal: AbortSignal | undefined;
			const load = query(
				'retired-stream',
				(_argument: undefined, context) => {
					signal = context.signal;
					return stream.iterable;
				},
				{ kind: 'stream' },
			);
			const resource$ = scope.asyncSignal$('resource', () => load(undefined));
			const observed: unknown[] = [];
			resource$.subscribe(() => observed.push(resource$.snapshot()));
			const wakeup = capturePending$(() => resource$.get());
			await stream.started;
			scope.dispose();
			scope.dispose();
			await wakeup;
			expect(signal?.aborted).toBe(true);
			expect(stream.cancellations).toBe(1);
			if (completion === 'yield') stream.emit('obsolete');
			else if (completion === 'reject') stream.fail(new Error('obsolete failure'));
			else stream.end();
			await drainProducers();
			expect(observed).toEqual([]);
			expect(() => resource$.get()).toThrow(ScopeDisposedError);
			expect(() => resource$.latest('fallback')).toThrow(ScopeDisposedError);
			expect(() => resource$.retry()).toThrow(ScopeDisposedError);
		},
	);

	it('does not acquire a stream whose asynchronous factory resolves after retirement', async () => {
		const scope = owner();
		const stream = controlledStream<string>();
		const factory = deferred<AsyncIterable<string>>();
		const load = query('late-stream-factory', () => factory.promise, { kind: 'stream' });
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		expect(resource$.snapshot().status).toBe('pending');
		scope.dispose();
		factory.resolve(stream.iterable);
		await drainProducers();
		expect(stream.nextCalls).toBe(0);
		expect(() => resource$.snapshot()).toThrow(ScopeDisposedError);
	});

	it.each(['throw', 'reject'] as const)(
		'keeps a new selection usable when iterator cleanup can %s',
		async (kind) => {
			const scope = owner();
			const selected$ = scope.signal$('selected', 'a');
			const cleanupError = new Error('obsolete close failed');
			const first = controlledStream<string>({
				onReturn: () => {
					if (kind === 'throw') throw cleanupError;
					return Promise.reject(cleanupError);
				},
			});
			const second = controlledStream<string>();
			const load = query(
				'throwing-close',
				(id: string) => (id === 'a' ? first.iterable : second.iterable),
				{ kind: 'stream' },
			);
			const resource$ = scope.asyncSignal$('resource', () => load(selected$.get()));
			await first.started;
			expect(() => selected$.set('b')).not.toThrow();
			expect(first.cancellations).toBe(1);
			const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
			second.emit('current');
			await ready;
			await drainProducers();
			expect(resource$.get()).toBe('current');
		},
	);

	it.each(['factory throws', 'factory rejects', 'iterator factory throws', 'next throws'] as const)(
		'reports a stream failure when its %s',
		async (stage) => {
			const scope = owner();
			const failure = new Error(stage);
			const stream = controlledStream<string>({
				onNext: () => {
					throw failure;
				},
			});
			const load = query(
				'producer-exception',
				() => {
					if (stage === 'factory throws') throw failure;
					if (stage === 'factory rejects') return Promise.reject(failure);
					if (stage === 'iterator factory throws')
						return {
							[Symbol.asyncIterator]() {
								throw failure;
							},
						};
					return stream.iterable;
				},
				{ kind: 'stream' },
			);
			const resource$ = scope.asyncSignal$('resource', () => load(undefined));
			await nextSnapshot$(resource$, (snapshot) => snapshot.status === 'error');
			expect(resource$.snapshot()).toMatchObject({
				status: 'error',
				error: failure,
				connection: 'closed',
			});
			expect(() => resource$.get()).toThrow(failure);
			expect(resource$.latest('fallback')).toBe('fallback');
			if (stage === 'next throws') expect(stream.cancellations).toBe(1);
		},
	);

	it.each([
		['not iterable', () => ({})],
		[
			'invalid iterator',
			() => ({
				[Symbol.asyncIterator]() {
					return {};
				},
			}),
		],
		[
			'invalid next result',
			() => ({
				[Symbol.asyncIterator]() {
					return { next: () => Promise.resolve(null) };
				},
			}),
		],
	] as const)('reports malformed producers as errors: %s', async (_name, create) => {
		const scope = owner();
		const load = query('invalid-producer', () => create() as AsyncIterable<string>, {
			kind: 'stream',
		});
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		await nextSnapshot$(resource$, (snapshot) => snapshot.status === 'error');
		expect(() => resource$.get()).toThrow(TypeError);
		expect(resource$.snapshot()).toMatchObject({
			status: 'error',
			connection: 'closed',
			complete: false,
		});
	});

	it.each(['done', 'value'] as const)(
		'reports a throwing iteration-result %s getter through the resource',
		async (property) => {
			const scope = owner();
			const failure = new Error(`reading ${property} failed`);
			let cancellations = 0;
			const result =
				property === 'done'
					? {
							get done(): boolean {
								throw failure;
							},
							value: 'unused',
						}
					: {
							done: false as const,
							get value(): string {
								throw failure;
							},
						};
			const iterable: AsyncIterable<string> = {
				[Symbol.asyncIterator]() {
					return {
						next: () => Promise.resolve(result as IteratorResult<string>),
						return: async () => {
							cancellations++;
							return { done: true, value: undefined };
						},
					};
				},
			};
			const load = query('throwing-result', () => iterable, { kind: 'stream' });
			const resource$ = scope.asyncSignal$('resource', () => load(undefined));
			await drainProducers();
			expect(resource$.snapshot()).toMatchObject({
				status: 'error',
				error: failure,
				connection: 'closed',
			});
			expect(() => resource$.get()).toThrow(failure);
			expect(cancellations).toBe(1);
		},
	);

	it('accepts a reentrant selection from iterator next without publishing the old value', async () => {
		const scope = owner();
		const selected$ = scope.signal$('selected', 'a');
		const first = controlledStream<string>({ onNext: () => selected$.set('b') });
		const second = controlledStream<string>();
		const load = query(
			'reentrant-next',
			(id: string) => (id === 'a' ? first.iterable : second.iterable),
			{ kind: 'stream' },
		);
		const resource$ = scope.asyncSignal$('resource', () => load(selected$.get()));
		await second.started;
		expect(selected$.get()).toBe('b');
		expect(first.cancellations).toBe(1);
		first.emit('obsolete');
		await drainProducers();
		expect(resource$.snapshot().status).toBe('pending');
		const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		second.emit('current b');
		await ready;
		expect(resource$.get()).toBe('current b');
	});

	it('accepts a reentrant selection from iterator cleanup without reviving the replaced request', async () => {
		const scope = owner();
		const selected$ = scope.signal$('selected', 'a');
		const first = controlledStream<string>({ onReturn: () => selected$.set('c') });
		const second = controlledStream<string>();
		const third = controlledStream<string>();
		const load = query(
			'reentrant-close',
			(id: string) => (id === 'a' ? first.iterable : id === 'b' ? second.iterable : third.iterable),
			{ kind: 'stream' },
		);
		const resource$ = scope.asyncSignal$('resource', () => load(selected$.get()));
		await first.started;
		selected$.set('b');
		expect(selected$.get()).toBe('c');
		await third.started;
		expect(first.cancellations).toBe(1);
		first.emit('obsolete a');
		second.emit('obsolete b');
		await drainProducers();
		expect(resource$.snapshot().status).toBe('pending');
		const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		third.emit('current c');
		await ready;
		expect(resource$.get()).toBe('current c');
	});
});
