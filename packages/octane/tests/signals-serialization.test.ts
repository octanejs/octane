import { describe, expect, it } from 'vitest';
import {
	createScope,
	query,
	ScopeDisposedError,
	SignalFrameError,
	SignalSerializationError,
	SignalWriteError,
	type ScopeSeed,
} from 'octane/signals';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

async function drain() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('scoped signal serialization and adoption', () => {
	it('does not expose retained request metadata through an editable serialized seed', async () => {
		const first = deferred<string>();
		const pending = deferred<string>();
		const load = query('editable-seed', (id: number) =>
			id === 1 ? first.promise : pending.promise,
		);
		const scope = createScope({ scopeKey: 'editable-seed' });
		const selected$ = scope.signal$('selected', 1);
		const result$ = scope.asyncSignal$('result', () => load(selected$.get()));
		first.resolve('old');
		await drain();
		selected$.set(2);
		expect(result$.latest()).toBe('old');
		const seed = scope.serialize();
		const argument = seed.entries.find((entry) => entry.key === 'result')!.request!.argument;
		if (argument[0] !== 'number')
			throw new Error('The public seed lost its numeric request argument.');
		argument[1] = 99;
		expect(
			scope.serialize().entries.find((entry) => entry.key === 'result')?.request?.argument,
		).toEqual(['number', 1]);
		scope.dispose();
	});

	it('round-trips plain data without losing undefined, negative zero, or property names', () => {
		const server = createScope({ scopeKey: 'plain' });
		const original = JSON.parse('{"__proto__":{"safe":true},"constructor":"data"}');
		original.items = [undefined, -0, null, false, ''];
		server.signal$('data', original);
		const seed = JSON.parse(JSON.stringify(server.serialize()));
		const client = createScope({ scopeKey: 'plain', seed });
		const data$ = client.signal$('data', {} as typeof original);
		expect(data$.get()).toEqual(original);
		expect(Object.is(data$.get().items[1], -0)).toBe(true);
		expect(Object.getPrototypeOf(data$.get())).toBe(Object.prototype);
		expect(Object.isFrozen(data$.get().items)).toBe(true);
		server.dispose();
		client.dispose();
	});

	it('reads presented derived values without rewinding live inputs or poisoning live caches', () => {
		const scope = createScope({ scopeKey: 'view' });
		const count$ = scope.signal$('count', 2);
		const label$ = scope.derived$('label', () => `count:${count$.get()}`);
		expect(label$.get()).toBe('count:2');
		const frame = scope.beginAdoption(scope.serialize());
		count$.set(7);
		expect(label$.get()).toBe('count:7');
		expect(frame.run(() => [count$.get(), label$.get()])).toEqual([2, 'count:2']);
		expect([count$.get(), label$.get()]).toEqual([7, 'count:7']);
		frame.release();
		scope.dispose();
	});

	it('does not initialize a live derived cache with an older seed after an early edit', () => {
		const server = createScope({ scopeKey: 'early' });
		const serverCount$ = server.signal$('count', 2);
		server.derived$('double', () => serverCount$.get() * 2);
		const seed = server.serialize();
		const client = createScope({ scopeKey: 'early', seed });
		const count$ = client.signal$('count', 0);
		count$.set(9);
		const double$ = client.derived$('double', () => count$.get() * 2);
		expect(double$.get()).toBe(18);
		const frame = client.beginAdoption(seed);
		expect(frame.run(() => double$.get())).toBe(4);
		expect(double$.get()).toBe(18);
		frame.release();
		server.dispose();
		client.dispose();
	});

	it('keeps independent frame leases usable until each lease is released', () => {
		const scope = createScope({ scopeKey: 'leases' });
		const value$ = scope.signal$('value', 1);
		const first = scope.beginAdoption(scope.serialize());
		const second = first.retain();
		value$.set(2);
		first.release();
		first.release();
		expect(() => first.run(() => value$.get())).toThrow(SignalFrameError);
		expect(second.run(() => value$.get())).toBe(1);
		second.release();
		expect(() => second.retain()).toThrow(SignalFrameError);
		expect(value$.get()).toBe(2);
		scope.dispose();
	});

	it('rejects writes, allocation, and retirement during historical reads', () => {
		const scope = createScope({ scopeKey: 'pure-frame' });
		const value$ = scope.signal$('value', 1);
		const frame = scope.beginAdoption(scope.serialize());
		for (const write of [
			() => value$.set(2),
			() => scope.signal$('new', 0),
			() => scope.dispose(),
		]) {
			expect(() => frame.run(write)).toThrow(SignalWriteError);
		}
		expect(value$.get()).toBe(1);
		expect(scope.retired).toBe(false);
		frame.release();
		scope.dispose();
	});

	it('requires every owner in a historical read to have an explicit frame', () => {
		const first = createScope({ scopeKey: 'first' });
		const second = createScope({ scopeKey: 'second' });
		const a$ = first.signal$('a', 1);
		const b$ = second.signal$('b', 2);
		const firstFrame = first.beginAdoption(first.serialize());
		const secondFrame = second.beginAdoption(second.serialize());
		a$.set(3);
		b$.set(4);
		expect(() => firstFrame.run(() => b$.get())).toThrow(SignalFrameError);
		expect(firstFrame.run(() => secondFrame.run(() => [a$.get(), b$.get()]))).toEqual([1, 2]);
		expect([a$.get(), b$.get()]).toEqual([3, 4]);
		first.dispose();
		second.dispose();
	});

	it('revokes all historical and retained reads when the data owner is retired', () => {
		const scope = createScope({ scopeKey: 'retire' });
		const value$ = scope.signal$('value', 1);
		const frame = scope.beginAdoption(scope.serialize());
		const retained = frame.retain();
		scope.dispose();
		expect(frame.released).toBe(true);
		expect(retained.released).toBe(true);
		expect(() => retained.run(() => value$.latest())).toThrow(ScopeDisposedError);
		expect(() => value$.latest()).toThrow(ScopeDisposedError);
	});

	it.each([false, true])(
		'owns copied historical values through the adopting scope and its leases (wireRoundTrip=%s)',
		(wireRoundTrip) => {
			const data = createScope({ scopeKey: 'original-data' });
			const view = createScope({ scopeKey: 'adopting-view' });
			const source$ = data.signal$('source', 'presented text');
			const card$ = view.derived$('card', () => ({ title: source$.get() }));
			const serialized = view.serialize();
			const seed = wireRoundTrip ? JSON.parse(JSON.stringify(serialized)) : serialized;
			const frame = view.beginAdoption(seed);
			const retained = frame.retain();
			try {
				data.dispose();
				expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
				expect(frame.run(() => card$.latest(null))).toEqual({ title: 'presented text' });
				frame.release();
				expect(() => frame.run(() => card$.latest(null))).toThrow(SignalFrameError);
				expect(retained.run(() => card$.latest(null))).toEqual({ title: 'presented text' });
				view.dispose();
				expect(retained.released).toBe(true);
				expect(() => retained.run(() => card$.latest(null))).toThrow(ScopeDisposedError);
			} finally {
				data.dispose();
				view.dispose();
			}
		},
	);

	it.each(['ready', 'retained'] as const)(
		'does not serialize a %s foreign value from the retiring owner cancellation callback',
		(mode) => {
			const data = createScope({ scopeKey: 'retiring-data' });
			const view = createScope({ scopeKey: 'serializing-view' });
			const value$ = data.signal$('value', 'private text');
			const blocked$ = view.signal$('blocked', false);
			const card$ = view.derived$('card', () => {
				if (blocked$.get()) throw new Error('view unavailable');
				return { title: value$.get() };
			});
			const observed: unknown[] = [];
			const load = query('serialization-during-retirement', (_argument: undefined, { signal }) => {
				signal.addEventListener('abort', () => {
					try {
						observed.push(view.serialize());
					} catch (error) {
						observed.push(error);
					}
				});
				return new Promise<void>(() => {});
			});
			data.asyncSignal$('work', () => load(undefined));
			try {
				expect(card$.get()).toEqual({ title: 'private text' });
				if (mode === 'retained') blocked$.set(true);
				expect(card$.latest(null)).toEqual({ title: 'private text' });
				data.dispose();
				expect(observed).toEqual([expect.any(ScopeDisposedError)]);
			} finally {
				data.dispose();
				view.dispose();
			}
		},
	);

	it('retains the whole old resource result and its argument while a new selection is pending', async () => {
		const one = deferred<{ name: string }>();
		const two = deferred<{ name: string }>();
		const load = query('person', (id: number) => (id === 1 ? one.promise : two.promise));
		const scope = createScope({ scopeKey: 'people' });
		const id$ = scope.signal$('id', 1);
		const person$ = scope.asyncSignal$('person', () => load(id$.get()));
		one.resolve({ name: 'one' });
		await drain();
		id$.set(2);
		expect(person$.latest()).toEqual({ name: 'one' });
		const frame = scope.beginAdoption(scope.serialize());
		two.resolve({ name: 'two' });
		await drain();
		expect(frame.run(() => person$.latest())).toEqual({ name: 'one' });
		expect(() => frame.run(() => person$.get())).toThrow(SignalFrameError);
		expect(person$.get()).toEqual({ name: 'two' });
		frame.release();
		scope.dispose();
	});

	it('preserves an unavailable latest projection after the live request becomes ready', async () => {
		const pending = deferred<string>();
		const load = query('pending', () => pending.promise);
		const scope = createScope({ scopeKey: 'fallback' });
		const value$ = scope.asyncSignal$('value', () => load(undefined));
		expect(value$.latest('waiting')).toBe('waiting');
		const frame = scope.beginAdoption(scope.serialize());
		pending.resolve('ready');
		await drain();
		expect(frame.run(() => value$.latest('waiting'))).toBe('waiting');
		expect(value$.get()).toBe('ready');
		frame.release();
		scope.dispose();
	});

	it('preserves a retained derived computation as a whole during a pending refresh', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const load = query('result', (id: number) => (id === 1 ? first.promise : second.promise));
		const scope = createScope({ scopeKey: 'projection' });
		const id$ = scope.signal$('id', 1);
		const result$ = scope.asyncSignal$('result', () => load(id$.get()));
		const view$ = scope.derived$('view', () => ({ id: id$.get(), result: result$.get() }));
		first.resolve('first');
		await drain();
		expect(view$.get()).toEqual({ id: 1, result: 'first' });
		id$.set(2);
		expect(view$.latest()).toEqual({ id: 1, result: 'first' });
		const frame = scope.beginAdoption(scope.serialize());
		second.resolve('second');
		await drain();
		expect(view$.get()).toEqual({ id: 2, result: 'second' });
		expect(frame.run(() => view$.latest())).toEqual({ id: 1, result: 'first' });
		frame.release();
		scope.dispose();
	});

	it('preserves ready snapshot activity without transporting a pending producer', async () => {
		const attempts = [deferred<string>(), deferred<string>()];
		let index = 0;
		const load = query('refresh', () => attempts[index++]!.promise);
		const scope = createScope({ scopeKey: 'activity' });
		const value$ = scope.asyncSignal$('value', () => load(undefined));
		attempts[0]!.resolve('old');
		await drain();
		value$.retry();
		const snapshot = value$.snapshot();
		expect(snapshot).toMatchObject({ status: 'ready', refreshing: true, complete: false });
		const frame = scope.beginAdoption(scope.serialize());
		attempts[1]!.resolve('new');
		await drain();
		expect(frame.run(() => value$.snapshot())).toEqual(snapshot);
		expect(value$.snapshot()).toMatchObject({ value: 'new', refreshing: false, complete: true });
		frame.release();
		scope.dispose();
	});

	it('uses a matching completed request seed without starting the client loader', async () => {
		const serverLoad = query('request', (id: number) => `server:${id}`);
		const server = createScope({ scopeKey: 'ready' });
		server.asyncSignal$('result', () => serverLoad(1));
		await drain();
		let starts = 0;
		const clientLoad = query('request', (id: number) => {
			starts++;
			return `client:${id}`;
		});
		const client = createScope({ scopeKey: 'ready', seed: server.serialize() });
		const result$ = client.asyncSignal$('result', () => clientLoad(1));
		expect(result$.get()).toBe('server:1');
		expect(starts).toBe(0);
		server.dispose();
		client.dispose();
	});

	it('never serves a request seed as the strict value of a changed argument', async () => {
		const server = createScope({ scopeKey: 'changed-argument' });
		const serverId$ = server.signal$('id', 1);
		const serverLoad = query('request', (id: number) => `server:${id}`);
		server.asyncSignal$('result', () => serverLoad(serverId$.get()));
		await drain();
		const pending = deferred<string>();
		const clientLoad = query('request', () => pending.promise);
		const client = createScope({ scopeKey: 'changed-argument', seed: server.serialize() });
		const id$ = client.signal$('id', 0);
		id$.set(2);
		const result$ = client.asyncSignal$('result', () => clientLoad(id$.get()));
		expect(client.isPending(() => result$.get())).toBe(true);
		pending.resolve('client:2');
		await drain();
		expect(result$.get()).toBe('client:2');
		server.dispose();
		client.dispose();
	});

	it('rejects seeds for a different scope, duplicate read channels, and incompatible node kinds', () => {
		const scope = createScope({ scopeKey: 'validation' });
		scope.signal$('value', 1);
		const seed = scope.serialize();
		expect(() => scope.beginAdoption({ ...seed, scopeKey: 'other' })).toThrow(SignalFrameError);
		expect(() =>
			scope.beginAdoption({ ...seed, entries: [seed.entries[0]!, seed.entries[0]!] }),
		).toThrow(SignalFrameError);
		const client = createScope({ scopeKey: 'validation', seed });
		expect(() => client.derived$('value', () => 1)).toThrow(SignalFrameError);
		scope.dispose();
		client.dispose();
	});

	it('rejects cyclic and malformed encoded data without executing accessors', () => {
		const scope = createScope({ scopeKey: 'malformed' });
		const seedFor = (value: unknown) =>
			({
				version: 1,
				scopeKey: 'malformed',
				entries: [{ key: 'value', kind: 'signal', value, complete: true }],
			}) as ScopeSeed;
		const cyclic: unknown[] = ['array', []];
		(cyclic[1] as unknown[]).push(cyclic);
		const sparse = ['array', new Array(1)];
		let getterCalls = 0;
		const accessor: unknown[] = ['string', 'value'];
		Object.defineProperty(accessor, '1', {
			enumerable: true,
			get() {
				getterCalls++;
				return 'value';
			},
		});
		for (const malformed of [
			cyclic,
			sparse,
			accessor,
			['number', NaN],
			[
				'object',
				[
					['b', ['null']],
					['a', ['null']],
				],
			],
		]) {
			expect(() => scope.beginAdoption(seedFor(malformed))).toThrow(SignalSerializationError);
		}
		expect(getterCalls).toBe(0);
		scope.dispose();
	});

	it('rejects nonserializable live values without changing the live graph', () => {
		const scope = createScope({ scopeKey: 'nonserializable' });
		const data = { callback() {} };
		const value$ = scope.signal$('value', data);
		expect(() => scope.serialize()).toThrow(SignalSerializationError);
		expect(value$.get()).toBe(data);
		scope.dispose();
	});
});
