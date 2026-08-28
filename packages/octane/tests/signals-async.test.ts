import { afterEach, describe, expect, it } from 'vitest';
import {
	createScope,
	query,
	ScopeDisposedError,
	SignalSerializationError,
	SignalWriteError,
	type Scope,
	type Resource,
} from 'octane/signals';
import {
	capturePending$,
	deferred,
	drainProducers,
	nextSnapshot$,
	type Deferred,
} from './_fixtures/signals-async-controls';

const owners: Scope[] = [];
function owner(key = `async-${owners.length}`): Scope {
	const scope = createScope({ scopeKey: key });
	owners.push(scope);
	return scope;
}

afterEach(() => {
	for (const scope of owners.splice(0)) scope.dispose();
});

const permutations = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0],
];

describe('scoped promise resources', () => {
	it('does not track cancellation callback reads as request-description dependencies', () => {
		const scope = owner('untracked-abort');
		const selected$ = scope.signal$('selected', 'a');
		const sampled$ = scope.signal$('sampled', 0);
		const samples: number[] = [];
		const load = query('abort-samples', (_id: string, { signal }) => {
			signal.addEventListener('abort', () => {
				if (!scope.retired) samples.push(sampled$.get());
			});
			return new Promise<string>(() => {});
		});
		scope.asyncSignal$('resource', () => load(selected$.get()));
		selected$.set('b');
		expect(samples).toEqual([0]);
		expect(scope.inspect().nodes.find((node) => node.key === 'resource')?.dependencies).toEqual([
			{ scopeKey: scope.scopeKey, key: 'selected' },
		]);
	});

	it('does not start replacement work after an abort callback retires the owner', () => {
		const scope = owner('dispose-in-abort');
		const signals: AbortSignal[] = [];
		const load = query('abort-retires-owner', (_argument: undefined, { signal }) => {
			signals.push(signal);
			signal.addEventListener('abort', () => scope.dispose(), { once: true });
			return new Promise<string>(() => {});
		});
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		resource$.retry();
		expect(signals.map((signal) => signal.aborted)).toEqual([true]);
		expect(scope.inspect()).toMatchObject({ retired: true, activeRequests: 0 });
		expect(() => resource$.get()).toThrow(ScopeDisposedError);
	});

	it('rejects cached foreign reads before cancellation callbacks finish owner retirement', () => {
		const data = owner('retiring-data');
		const view = owner('surviving-view');
		const value$ = data.signal$('value', 'private value');
		const card$ = view.derived$('card', () => ({ title: value$.get() }));
		const observed: unknown[] = [];
		const load = query('retirement-observer', (_argument: undefined, { signal }) => {
			signal.addEventListener('abort', () => {
				for (const read of [() => card$.get(), () => card$.latest(null), () => card$.snapshot()]) {
					try {
						observed.push(read());
					} catch (error) {
						observed.push(error);
					}
				}
			});
			return new Promise<void>(() => {});
		});
		data.asyncSignal$('work', () => load(undefined));
		expect(card$.get()).toEqual({ title: 'private value' });

		data.dispose();

		expect(observed).toEqual([
			expect.any(ScopeDisposedError),
			expect.any(ScopeDisposedError),
			expect.any(ScopeDisposedError),
		]);
		expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
	});

	it('preserves a nested retry started by cancellation without orphaning its producer', async () => {
		const scope = owner('retry-in-abort');
		const attempts: { signal: AbortSignal; completion: Deferred<string> }[] = [];
		let resource$!: Resource<string>;
		let retried = false;
		const load = query('abort-retries', (_argument: undefined, { signal }) => {
			const completion = deferred<string>();
			attempts.push({ signal, completion });
			signal.addEventListener(
				'abort',
				() => {
					if (!retried) {
						retried = true;
						resource$.retry();
					}
				},
				{ once: true },
			);
			return completion.promise;
		});
		resource$ = scope.asyncSignal$('resource', () => load(undefined));
		resource$.retry();
		expect(attempts.map(({ signal }) => signal.aborted)).toEqual([true, false]);
		attempts[0].completion.resolve('obsolete');
		attempts[1].completion.resolve('nested current');
		await drainProducers();
		expect(resource$.get()).toBe('nested current');
		resource$.retry();
		scope.dispose();
		expect(attempts[2].signal.aborted).toBe(true);
		expect(scope.inspect().activeRequests).toBe(0);
	});

	it('does not replace a nested retry that failed synchronously during cancellation', () => {
		const scope = owner('failing-retry-in-abort');
		let resource$!: Resource<string>;
		let calls = 0;
		const failure = new Error('nested retry failed');
		const load = query('abort-retry-failure', (_argument: undefined, { signal }) => {
			calls++;
			if (calls > 1) throw failure;
			signal.addEventListener('abort', () => resource$.retry(), { once: true });
			return new Promise<string>(() => {});
		});
		resource$ = scope.asyncSignal$('resource', () => load(undefined));
		resource$.retry();
		expect(calls).toBe(2);
		expect(() => resource$.get()).toThrow(failure);
	});

	it.each([undefined, null, '', false, 0])(
		'distinguishes pending from the ready value %j',
		async (value) => {
			const scope = owner();
			const completion = deferred<typeof value>();
			const load = query('empty-value', () => completion.promise);
			const value$ = scope.asyncSignal$('value', () => load(undefined));
			expect(value$.snapshot()).toMatchObject({
				status: 'pending',
				refreshing: false,
				complete: false,
			});
			expect(value$.latest('fallback')).toBe('fallback');
			expect(scope.isPending(() => value$.get())).toBe(true);
			const wakeup = capturePending$(() => value$.get());
			const ready = nextSnapshot$(value$, (snapshot) => snapshot.status === 'ready');
			completion.resolve(value);
			await ready;
			await wakeup;
			expect(value$.get()).toBe(value);
			expect(value$.latest('fallback')).toBe(value);
			expect(scope.isPending(() => value$.get())).toBe(false);
			expect(value$.snapshot()).toMatchObject({
				status: 'ready',
				value,
				refreshing: false,
				complete: true,
				connection: 'none',
			});
		},
	);

	it('accepts synchronous loader results and failures through the same public states', async () => {
		const scope = owner();
		const success = query('sync-success', () => 'available');
		const failure = new Error('synchronous loader failed');
		const fail = query('sync-failure', () => {
			throw failure;
		});
		const success$ = scope.asyncSignal$('success', () => success(undefined));
		const failure$ = scope.asyncSignal$('failure', () => fail(undefined));
		await nextSnapshot$(success$, (snapshot) => snapshot.status === 'ready');
		expect(success$.get()).toBe('available');
		expect(failure$.snapshot()).toMatchObject({ status: 'error', error: failure });
		expect(() => failure$.get()).toThrow(failure);
		expect(() => scope.isPending(() => failure$.get())).toThrow(failure);
	});

	it('shares equivalent canonical arguments within the owning scope', async () => {
		const scope = owner();
		const completion = deferred<string>();
		const starts: unknown[] = [];
		const load = query('canonical', (argument: unknown) => {
			starts.push(argument);
			return completion.promise;
		});
		const first$ = scope.asyncSignal$('first', () =>
			load({ z: [undefined, -0], a: { y: 2, x: 1 } }),
		);
		const second$ = scope.asyncSignal$('second', () =>
			load({ a: { x: 1, y: 2 }, z: [undefined, -0] }),
		);
		const ready = Promise.all(
			[first$, second$].map((resource$) =>
				nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready'),
			),
		);
		expect(starts).toEqual([{ a: { x: 1, y: 2 }, z: [undefined, -0] }]);
		completion.resolve('shared result');
		await ready;
		expect(first$.get()).toBe('shared result');
		expect(second$.get()).toBe('shared result');
	});

	it('does not collide distinct serializable arguments', async () => {
		const scope = owner();
		const arguments_ = [
			undefined,
			null,
			false,
			0,
			-0,
			'',
			[],
			{},
			{ value: undefined },
			['undefined'],
			{ value: null },
		];
		const attempts: Deferred<number>[] = [];
		const load = query('distinct', (_argument: unknown) => {
			const attempt = deferred<number>();
			attempts.push(attempt);
			return attempt.promise;
		});
		const resources = arguments_.map((argument, index) =>
			scope.asyncSignal$(`value-${index}`, () => load(argument)),
		);
		const ready = Promise.all(
			resources.map((resource$) =>
				nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready'),
			),
		);
		expect(attempts).toHaveLength(arguments_.length);
		attempts.forEach((attempt, index) => attempt.resolve(index));
		await ready;
		expect(resources.map((resource$) => resource$.get())).toEqual(
			arguments_.map((_, index) => index),
		);
	});

	it('captures immutable argument data when a request is described', async () => {
		const scope = owner();
		const arguments_ = { nested: { id: 1 }, ids: [1, 2] };
		const received: (typeof arguments_)[] = [];
		const load = query('argument-copy', (argument: typeof arguments_) => {
			received.push(argument);
			return `${argument.nested.id}:${argument.ids.join(',')}`;
		});
		const original = load(arguments_);
		arguments_.nested.id = 9;
		arguments_.ids.push(3);
		const first$ = scope.asyncSignal$('first', () => original);
		const second$ = scope.asyncSignal$('second', () => load(arguments_));
		await Promise.all(
			[first$, second$].map((resource$) =>
				nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready'),
			),
		);
		expect(first$.get()).toBe('1:1,2');
		expect(second$.get()).toBe('9:1,2,3');
		expect(received).toEqual([
			{ nested: { id: 1 }, ids: [1, 2] },
			{ nested: { id: 9 }, ids: [1, 2, 3] },
		]);
	});

	it.each<[string, () => unknown]>([
		['NaN', () => Number.NaN],
		['infinity', () => Infinity],
		['negative infinity', () => -Infinity],
		['bigint', () => 1n],
		['symbol', () => Symbol('key')],
		['function', () => () => {}],
		['date', () => new Date(0)],
		['promise', () => Promise.resolve(1)],
		['sparse array', () => new Array(1)],
		[
			'cyclic object',
			() => {
				const value: { self?: unknown } = {};
				value.self = value;
				return value;
			},
		],
		['symbol property', () => ({ [Symbol('key')]: 1 })],
		['non-enumerable property', () => Object.defineProperty({}, 'hidden', { value: 1 })],
		[
			'accessor property',
			() => ({
				get value() {
					throw new Error('Accessor must not execute.');
				},
			}),
		],
		['extra array property', () => Object.assign([1], { extra: 2 })],
	])('rejects %s arguments without calling the loader', (_name, makeArgument) => {
		const starts: unknown[] = [];
		const load = query('invalid-argument', (argument: unknown) => {
			starts.push(argument);
			return 1;
		});
		expect(() => load(makeArgument())).toThrow(SignalSerializationError);
		expect(starts).toEqual([]);
	});

	it('does not share requests across different owners with the same durable key', async () => {
		const attempts: Deferred<string>[] = [];
		const load = query('scope-local', () => {
			const attempt = deferred<string>();
			attempts.push(attempt);
			return attempt.promise;
		});
		const first$ = owner('same-key').asyncSignal$('value', () => load('same-argument'));
		const second$ = owner('same-key').asyncSignal$('value', () => load('same-argument'));
		const ready = Promise.all(
			[first$, second$].map((resource$) =>
				nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready'),
			),
		);
		expect(attempts).toHaveLength(2);
		attempts[0].resolve('first owner');
		attempts[1].resolve('second owner');
		await ready;
		expect(first$.get()).toBe('first owner');
		expect(second$.get()).toBe('second owner');
	});

	it('rejects incompatible query definitions without replacing a valid resource', async () => {
		const scope = owner();
		const load = query('same-query', () => 'original');
		const incompatible = query('same-query', () => 'different loader');
		const first$ = scope.asyncSignal$('first', () => load(1));
		const second$ = scope.asyncSignal$('second', () => incompatible(1));
		await nextSnapshot$(first$, (snapshot) => snapshot.status === 'ready');
		expect(() => second$.get()).toThrow(/[Ii]ncompatible query/);
		expect(first$.get()).toBe('original');
	});

	it('tracks request descriptions while excluding the loader synchronous prefix', async () => {
		const scope = owner();
		const selected$ = scope.signal$('selected', 'a');
		const incidental$ = scope.signal$('incidental', 1);
		const starts: { id: string; sampled: number; gate: Deferred<string> }[] = [];
		const load = query('untracked-loader', (id: string) => {
			const gate = deferred<string>();
			starts.push({ id, sampled: incidental$.get(), gate });
			return gate.promise;
		});
		const resource$ = scope.asyncSignal$('resource', () => load(selected$.get()));
		const firstReady = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		incidental$.set(2);
		expect(resource$.snapshot().status).toBe('pending');
		expect(starts.map(({ id, sampled }) => ({ id, sampled }))).toEqual([{ id: 'a', sampled: 1 }]);
		starts[0].gate.resolve('a:1');
		await firstReady;
		incidental$.set(3);
		expect(resource$.get()).toBe('a:1');
		selected$.set('b');
		const secondReady = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		expect(starts.map(({ id, sampled }) => ({ id, sampled }))).toEqual([
			{ id: 'a', sampled: 1 },
			{ id: 'b', sampled: 3 },
		]);
		starts[1].gate.resolve('b:3');
		await secondReady;
		expect(resource$.get()).toBe('b:3');
	});

	it('rejects writes in request descriptions and restores later write permissions', async () => {
		const scope = owner();
		const invalid$ = scope.signal$('invalid', true);
		const target$ = scope.signal$('target', 0);
		const load = query('pure-description', () => 'recovered');
		const resource$ = scope.asyncSignal$('resource', () => {
			if (invalid$.get()) target$.set(1);
			return load(undefined);
		});
		expect(() => resource$.get()).toThrow(SignalWriteError);
		expect(target$.get()).toBe(0);
		invalid$.set(false);
		await nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		expect(resource$.get()).toBe('recovered');
		target$.set(2);
		expect(target$.get()).toBe(2);
	});

	it('reruns a failed request description on retry and starts exactly one recovered attempt', async () => {
		const scope = owner();
		const failure = new Error('description configuration unavailable');
		let available = false;
		const attempts: Deferred<string>[] = [];
		const load = query('description-retry', () => {
			const attempt = deferred<string>();
			attempts.push(attempt);
			return attempt.promise;
		});
		const resource$ = scope.asyncSignal$('resource', () => {
			if (!available) throw failure;
			return load('selected');
		});
		expect(() => resource$.get()).toThrow(failure);
		expect(attempts).toHaveLength(0);
		available = true;
		expect(() => resource$.retry()).not.toThrow();
		expect(attempts).toHaveLength(1);
		expect(resource$.snapshot().status).toBe('pending');
		const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		attempts[0].resolve('recovered');
		await ready;
		expect(resource$.get()).toBe('recovered');
	});

	it.each([false, true])(
		'does not let an untracked loader bypass a derived write guard with a cached projection=%s',
		async (cached) => {
			const scope = owner();
			const selected$ = scope.signal$('selected', 'a');
			const target$ = scope.signal$('target', 0);
			const load = query('guarded-loader', (id: string) => {
				if (id === 'b') target$.set(1);
				return id;
			});
			const resource$ = scope.asyncSignal$('resource', () => load(selected$.get()));
			const projection$ = scope.derived$('projection', () => resource$.get());
			await nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
			expect(resource$.get()).toBe('a');
			if (cached) expect(projection$.get()).toBe('a');
			scope.batch(() => {
				selected$.set('b');
				expect(() => projection$.get()).toThrow(SignalWriteError);
			});
			expect(target$.get()).toBe(0);
			target$.set(2);
			expect(target$.get()).toBe(2);
		},
	);

	it('converges after an imperative loader changes its own selection synchronously', async () => {
		const scope = owner();
		const selected$ = scope.signal$('selected', 'a');
		const attempts: { id: string; gate: Deferred<string>; signal: AbortSignal }[] = [];
		const load = query('reentrant-loader', (id: string, { signal }) => {
			const gate = deferred<string>();
			attempts.push({ id, gate, signal });
			if (id === 'a') selected$.set('b');
			return gate.promise;
		});
		const resource$ = scope.asyncSignal$('resource', () => load(selected$.get()));
		expect(resource$.snapshot().status).toBe('pending');
		expect(selected$.get()).toBe('b');
		expect(attempts.map(({ id }) => id)).toEqual(['a', 'b']);
		expect(attempts[0].signal.aborted).toBe(true);
		attempts[0].gate.resolve('obsolete a');
		await drainProducers();
		expect(resource$.snapshot().status).toBe('pending');
		const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		attempts[1].gate.resolve('current b');
		await ready;
		expect(resource$.get()).toBe('current b');
	});

	it.each(permutations)(
		'publishes only the selected A→B→A attempt in completion order %j,%j,%j',
		async (...order) => {
			const scope = owner();
			const selected$ = scope.signal$('selected', 'a');
			const attempts: { gate: Deferred<string>; signal: AbortSignal }[] = [];
			const load = query('selection-generation', (_id: string, { signal }) => {
				const gate = deferred<string>();
				attempts.push({ gate, signal });
				return gate.promise;
			});
			const resource$ = scope.asyncSignal$('resource', () => load(selected$.get()));
			const observed: string[] = [];
			resource$.subscribe(() => {
				const snapshot = resource$.snapshot();
				if (snapshot.status === 'ready') observed.push(snapshot.value);
			});
			const firstWakeup = capturePending$(() => resource$.get());
			selected$.set('b');
			const secondWakeup = capturePending$(() => resource$.get());
			selected$.set('a');
			expect(resource$.snapshot().status).toBe('pending');
			expect(attempts).toHaveLength(3);
			expect(attempts.map(({ signal }) => signal.aborted)).toEqual([true, true, false]);
			await Promise.all([firstWakeup, secondWakeup]);
			let accepted = false;
			for (const index of order) {
				attempts[index].gate.resolve(index === 2 ? 'current a' : `obsolete ${index}`);
				await drainProducers();
				accepted ||= index === 2;
				if (accepted) expect(resource$.get()).toBe('current a');
				else expect(resource$.snapshot().status).toBe('pending');
			}
			expect(observed).toEqual(['current a']);
		},
	);

	it('ignores both late rejection and resolution from superseded same-key retries', async () => {
		const scope = owner();
		const attempts: { gate: Deferred<string>; signal: AbortSignal }[] = [];
		const load = query('retry-generation', (_argument: undefined, { signal }) => {
			const gate = deferred<string>();
			attempts.push({ gate, signal });
			return gate.promise;
		});
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		expect(resource$.snapshot().status).toBe('pending');
		const oldWakeup = capturePending$(() => resource$.get());
		resource$.retry();
		resource$.retry({ pending: true });
		await oldWakeup;
		expect(attempts.map(({ signal }) => signal.aborted)).toEqual([true, true, false]);
		attempts[0].gate.reject(new Error('obsolete rejection'));
		attempts[1].gate.resolve('obsolete success');
		await drainProducers();
		expect(resource$.snapshot().status).toBe('pending');
		const ready = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		attempts[2].gate.resolve('current result');
		await ready;
		expect(resource$.get()).toBe('current result');
	});

	it.each([false, true])(
		'applies shared retries to every selector with pending=%s',
		async (pending) => {
			const scope = owner();
			const attempts: Deferred<string>[] = [];
			const load = query('shared-retry', () => {
				const gate = deferred<string>();
				attempts.push(gate);
				return gate.promise;
			});
			const first$ = scope.asyncSignal$('first', () => load('same'));
			const second$ = scope.asyncSignal$('second', () => load('same'));
			const initial = Promise.all(
				[first$, second$].map((resource$) =>
					nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready'),
				),
			);
			expect(attempts).toHaveLength(1);
			attempts[0].resolve('initial');
			await initial;
			first$.retry({ pending });
			for (const resource$ of [first$, second$]) {
				expect(resource$.snapshot()).toMatchObject(
					pending
						? { status: 'pending', refreshing: false, complete: false }
						: { status: 'ready', value: 'initial', refreshing: true, complete: false },
				);
				expect(resource$.latest('fallback')).toBe('initial');
				expect(scope.isPending(() => resource$.get())).toBe(pending);
			}
			expect(attempts).toHaveLength(2);
			const refreshed = Promise.all(
				[first$, second$].map((resource$) =>
					nextSnapshot$(
						resource$,
						(snapshot) => snapshot.status === 'ready' && !snapshot.refreshing,
					),
				),
			);
			attempts[1].resolve('refreshed');
			await refreshed;
			expect([first$.get(), second$.get()]).toEqual(['refreshed', 'refreshed']);
		},
	);

	it('checks the availability of fallback projections separately from request activity', async () => {
		const scope = owner('availability');
		const attempts: Deferred<string>[] = [];
		const load = query('availability', () => {
			const attempt = deferred<string>();
			attempts.push(attempt);
			return attempt.promise;
		});
		const result$ = scope.asyncSignal$('result', () => load(undefined));
		const label$ = scope.derived$('label', () => result$.latest('waiting'));
		expect(scope.isPending(() => result$.get())).toBe(true);
		expect(scope.isPending(() => result$.latest('waiting'))).toBe(false);
		expect(label$.get()).toBe('waiting');
		expect(scope.isPending(() => label$.get())).toBe(false);

		attempts[0].resolve('first result');
		await drainProducers();
		result$.retry();
		expect(result$.snapshot()).toMatchObject({
			status: 'ready',
			refreshing: true,
			complete: false,
		});
		expect(scope.isPending(() => result$.get())).toBe(false);
		expect(scope.isPending(() => label$.get())).toBe(false);

		result$.retry({ pending: true });
		expect(scope.isPending(() => result$.get())).toBe(true);
		expect(label$.get()).toBe('first result');
		expect(scope.isPending(() => label$.get())).toBe(false);
		const failure = new Error('new answer failed');
		attempts[2].reject(failure);
		await drainProducers();
		expect(() => scope.isPending(() => result$.get())).toThrow(failure);
		expect(label$.get()).toBe('first result');
		expect(scope.isPending(() => label$.get())).toBe(false);
	});

	it('loads a fresh answer when returning to a request no resource still owns', async () => {
		const scope = owner('no-idle-cache');
		const selected$ = scope.signal$('selected', 'a');
		const attempts: { id: string; result: Deferred<string> }[] = [];
		const load = query('revisit', (id: string) => {
			const result = deferred<string>();
			attempts.push({ id, result });
			return result.promise;
		});
		const result$ = scope.asyncSignal$('result', () => load(selected$.get()));
		attempts[0].result.resolve('first a');
		await drainProducers();
		expect(result$.get()).toBe('first a');
		selected$.set('b');
		expect(result$.latest(null)).toBe('first a');
		attempts[1].result.resolve('current b');
		await drainProducers();
		expect(result$.get()).toBe('current b');

		selected$.set('a');

		expect(scope.isPending(() => result$.get())).toBe(true);
		expect(result$.latest(null)).toBe('current b');
		expect(attempts.at(-1)?.id).toBe('a');
		attempts.at(-1)!.result.resolve('fresh a');
		await drainProducers();
		expect(result$.get()).toBe('fresh a');
	});

	it('retains the displayed identity and action with the whole successful card', async () => {
		const scope = owner('card-actions');
		const selected$ = scope.signal$('selected', 'a');
		const attempts = new Map<string, Deferred<{ id: string; title: string }>>();
		const actedOn: string[] = [];
		const load = query('card', (id: string) => {
			const result = deferred<{ id: string; title: string }>();
			attempts.set(id, result);
			return result.promise;
		});
		const record$ = scope.asyncSignal$('record', () => load(selected$.get()));
		const card$ = scope.derived$('card', () => {
			const record = record$.get();
			return { ...record, activate: () => actedOn.push(record.id) };
		});
		attempts.get('a')!.resolve({ id: 'a', title: 'First card' });
		await drainProducers();
		expect(card$.get()).toMatchObject({ id: 'a', title: 'First card' });
		selected$.set('b');
		const held = card$.latest(null)!;
		expect(selected$.get()).toBe('b');
		expect(held).toMatchObject({ id: 'a', title: 'First card' });
		held.activate();
		expect(actedOn).toEqual(['a']);
		attempts.get('b')!.resolve({ id: 'b', title: 'Second card' });
		await drainProducers();
		const current = card$.get();
		expect(current).toMatchObject({ id: 'b', title: 'Second card' });
		current.activate();
		expect(actedOn).toEqual(['a', 'b']);
	});

	it('revokes an old foreign result without canceling a valid replacement request', async () => {
		const previous = owner('previous-account');
		const replacement = owner('replacement-account');
		const view = owner('account-view');
		const previousId$ = previous.signal$('id', 'a');
		const replacementId$ = replacement.signal$('id', 'b');
		const selectReplacement$ = view.signal$('replacement', false);
		const attempts: { id: string; signal: AbortSignal; result: Deferred<string> }[] = [];
		const load = query('owned-result', (id: string, { signal }) => {
			const result = deferred<string>();
			attempts.push({ id, signal, result });
			return result.promise;
		});
		const result$ = view.asyncSignal$('result', () =>
			load(selectReplacement$.get() ? replacementId$.get() : previousId$.get()),
		);
		attempts[0].result.resolve('private a');
		await drainProducers();
		expect(result$.get()).toBe('private a');
		selectReplacement$.set(true);
		expect(result$.latest(null)).toBe('private a');
		const pending = capturePending$(() => result$.get());
		let awakened = false;
		void Promise.resolve(pending).then(() => {
			awakened = true;
		});

		previous.dispose();
		await drainProducers();

		expect(awakened).toBe(true);
		expect(() => result$.latest(null)).toThrow(ScopeDisposedError);
		expect(attempts[1].signal.aborted).toBe(false);
		attempts[1].result.resolve('current b');
		await drainProducers();
		expect(result$.get()).toBe('current b');
		replacement.dispose();
		expect(() => result$.latest(null)).toThrow(ScopeDisposedError);
	});

	it('releases retained ownership when switching to a different query family', async () => {
		const previous = owner('old-query-owner');
		const view = owner('query-view');
		const id$ = previous.signal$('id', 'a');
		const phase$ = view.signal$<'first' | 'blocked' | 'different'>('phase', 'first');
		const first = deferred<string>();
		const second = deferred<string>();
		const originalQuery = query('original', (_id: string) => first.promise);
		const replacementQuery = query('different', () => second.promise);
		const result$ = view.asyncSignal$('result', () => {
			const phase = phase$.get();
			if (phase === 'blocked') throw new Error('selection unavailable');
			return phase === 'first' ? originalQuery(id$.get()) : replacementQuery(undefined);
		});
		first.resolve('old private result');
		await drainProducers();
		expect(result$.get()).toBe('old private result');
		phase$.set('blocked');
		expect(result$.latest(null)).toBe('old private result');
		phase$.set('different');
		expect(result$.latest(null)).toBeNull();

		previous.dispose();

		expect(view.isPending(() => result$.get())).toBe(true);
		second.resolve('different result');
		await drainProducers();
		expect(result$.get()).toBe('different result');
	});

	it('keeps a shared request alive until the last resource selects another identity', async () => {
		const scope = owner();
		const firstId$ = scope.signal$('first-id', 'a');
		const secondId$ = scope.signal$('second-id', 'a');
		const attempts: { id: string; gate: Deferred<string>; signal: AbortSignal }[] = [];
		const load = query('shared-lifetime', (id: string, { signal }) => {
			const gate = deferred<string>();
			attempts.push({ id, gate, signal });
			return gate.promise;
		});
		const first$ = scope.asyncSignal$('first', () => load(firstId$.get()));
		const second$ = scope.asyncSignal$('second', () => load(secondId$.get()));
		first$.snapshot();
		second$.snapshot();
		expect(attempts.map(({ id }) => id)).toEqual(['a']);
		firstId$.set('b');
		first$.snapshot();
		expect(attempts[0].signal.aborted).toBe(false);
		secondId$.set('c');
		second$.snapshot();
		expect(attempts[0].signal.aborted).toBe(true);
		const ready = Promise.all(
			[first$, second$].map((resource$) =>
				nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready'),
			),
		);
		attempts[0].gate.resolve('obsolete shared a');
		attempts[1].gate.resolve('current b');
		attempts[2].gate.resolve('current c');
		await ready;
		expect([first$.get(), second$.get()]).toEqual(['current b', 'current c']);
	});

	it('retains a whole successful projection across partial replacement and failure', async () => {
		const scope = owner();
		const selected$ = scope.signal$('selected', 'a');
		const attempts = new Map<string, Deferred<string>>();
		const load = query('projection-part', (argument: { id: string; part: string }) => {
			const gate = deferred<string>();
			attempts.set(`${argument.id}:${argument.part}`, gate);
			return gate.promise;
		});
		const left$ = scope.asyncSignal$('left', () => load({ id: selected$.get(), part: 'left' }));
		const right$ = scope.asyncSignal$('right', () => load({ id: selected$.get(), part: 'right' }));
		const card$ = scope.derived$('card', () => ({
			id: selected$.get(),
			left: left$.get(),
			right: right$.get(),
		}));
		left$.snapshot();
		right$.snapshot();
		expect(card$.latest(null)).toBeNull();
		const firstReady = nextSnapshot$(card$, (snapshot) => snapshot.status === 'ready');
		attempts.get('a:left')!.resolve('a left');
		attempts.get('a:right')!.resolve('a right');
		await firstReady;
		const original = card$.get();
		expect(original).toEqual({ id: 'a', left: 'a left', right: 'a right' });
		selected$.set('b');
		left$.snapshot();
		right$.snapshot();
		expect(card$.latest(null)).toBe(original);
		attempts.get('b:left')!.resolve('b left');
		await drainProducers();
		expect(card$.latest(null)).toBe(original);
		expect(card$.snapshot().status).toBe('pending');
		const failure = new Error('b right failed');
		attempts.get('b:right')!.reject(failure);
		await drainProducers();
		expect(card$.latest(null)).toBe(original);
		expect(card$.snapshot()).toMatchObject({ status: 'error', error: failure });
		expect(() => scope.isPending(() => card$.get())).toThrow(failure);
		right$.retry();
		const recovered = nextSnapshot$(card$, (snapshot) => snapshot.status === 'ready');
		attempts.get('b:right')!.resolve('b right');
		await recovered;
		expect(card$.get()).toEqual({ id: 'b', left: 'b left', right: 'b right' });
	});

	it.each(permutations)(
		'retains complete results while independent promises resolve in order %j,%j,%j',
		async (...order) => {
			const scope = owner();
			const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
			const load = query('independent', (index: number) => gates[index].promise);
			const resources = gates.map((_, index) =>
				scope.asyncSignal$(`resource-${index}`, () => load(index)),
			);
			resources.forEach((resource$) => resource$.snapshot());
			const projection$ = scope.derived$('projection', () =>
				resources.map((resource$) => resource$.get()),
			);
			const observed: number[][] = [];
			projection$.subscribe(() => {
				const snapshot = projection$.snapshot();
				if (snapshot.status === 'ready') observed.push(snapshot.value);
			});
			for (const [step, index] of order.entries()) {
				gates[index].resolve(index * 10);
				await drainProducers();
				if (step < order.length - 1) expect(projection$.latest(null)).toBeNull();
			}
			expect(projection$.get()).toEqual([0, 10, 20]);
			expect(observed).toEqual([[0, 10, 20]]);
		},
	);

	it('keeps refresh errors separate from retained data and requires an explicit retry', async () => {
		const scope = owner();
		const attempts: Deferred<string>[] = [];
		const load = query('refresh-error', () => {
			const gate = deferred<string>();
			attempts.push(gate);
			return gate.promise;
		});
		const resource$ = scope.asyncSignal$('resource', () => load(undefined));
		const initial = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		attempts[0].resolve('retained');
		await initial;
		resource$.retry();
		expect(resource$.get()).toBe('retained');
		expect(resource$.snapshot()).toMatchObject({ status: 'ready', refreshing: true });
		const failure = new Error('refresh failed');
		const failed = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'error');
		attempts[1].reject(failure);
		await failed;
		expect(resource$.latest('fallback')).toBe('retained');
		expect(() => resource$.get()).toThrow(failure);
		expect(() => scope.isPending(() => resource$.get())).toThrow(failure);
		expect(resource$.snapshot()).toMatchObject({
			status: 'error',
			error: failure,
			refreshing: false,
		});
		expect(attempts).toHaveLength(2);
		resource$.retry();
		const recovered = nextSnapshot$(resource$, (snapshot) => snapshot.status === 'ready');
		attempts[2].resolve('recovered');
		await recovered;
		expect(resource$.get()).toBe('recovered');
	});

	it.each(['resolve', 'reject'] as const)(
		'retires owned producers and ignores a late %s even when abort is ignored',
		async (completion) => {
			const scope = owner();
			const gate = deferred<string>();
			let signal: AbortSignal | undefined;
			const load = query('retired', (_argument: undefined, context) => {
				signal = context.signal;
				return gate.promise;
			});
			const resource$ = scope.asyncSignal$('resource', () => load(undefined));
			const observed: unknown[] = [];
			const stop = resource$.subscribe(() => observed.push(resource$.snapshot()));
			const wakeup = capturePending$(() => resource$.get());
			stop();
			expect(signal?.aborted).toBe(false);
			resource$.subscribe(() => observed.push(resource$.snapshot()));
			scope.dispose();
			await wakeup;
			expect(signal?.aborted).toBe(true);
			if (completion === 'resolve') gate.resolve('must not publish');
			else gate.reject(new Error('must not publish'));
			await drainProducers();
			expect(observed).toEqual([]);
			for (const read of [
				() => resource$.get(),
				() => resource$.latest(null),
				() => resource$.snapshot(),
				() => resource$.retry(),
			]) {
				expect(read).toThrow(ScopeDisposedError);
			}
		},
	);
});
