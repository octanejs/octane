import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createFamily,
	createScope,
	ScopeDisposedError,
	SIGNAL_BINDING_SUBSCRIBE,
	SignalWriteError,
	type Scope,
} from 'octane/signals';
import { setNativeReadObserver, type NativeReadSource } from '../src/signals/read-protocol.js';

// The renderer-binding retirement probe, by its registered name.
const SIGNAL_BINDING_RETIRED = Symbol.for('octane.signal-binding-retired');

const owners: Scope[] = [];
function owner(key = `family-${owners.length}`): Scope {
	const scope = createScope({ scopeKey: key });
	owners.push(scope);
	return scope;
}

afterEach(() => {
	vi.useRealTimers();
	for (const scope of owners.splice(0)) scope.dispose();
});

// A WeakRef keeps its target alive until the current job ends, so collect on
// later macrotasks.
async function collectGarbage(): Promise<void> {
	setFlagsFromString('--expose-gc');
	const gc = runInNewContext('gc') as () => void;
	setFlagsFromString('--no-expose-gc');
	for (let attempt = 0; attempt < 3; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		gc();
	}
}

describe('signal families', () => {
	it('returns one stable member per key, created on first use', () => {
		const scope = owner();
		const created: string[] = [];
		const row = createFamily(scope, (id: string) => {
			created.push(id);
			return scope.signal$(null, { id, done: false });
		});
		const a$ = row.get('a');
		expect(row.get('a')).toBe(a$);
		expect(row.get('b')).not.toBe(a$);
		expect(created).toEqual(['a', 'b']);
		expect([row.size, row.has('a'), row.has('c')]).toEqual([2, true, false]);
		a$.set((previous) => ({ ...previous, done: true }));
		expect(row.get('a').get()).toEqual({ id: 'a', done: true });
		expect(row.get('b').get()).toEqual({ id: 'b', done: false });
		// Members take no room in the scope's key table.
		expect(scope.inspect().nodes).toEqual([]);
		expect(scope.serialize().entries).toEqual([]);
	});

	it('finds members by keyOf, or as a Map compares keys', () => {
		const scope = owner();
		const cell = createFamily(
			scope,
			([r, c]: [number, number]) => scope.signal$(null, r * 10 + c),
			{
				keyOf: ([r, c]) => `${r}:${c}`,
			},
		);
		expect(cell.get([1, 2])).toBe(cell.get([1, 2]));
		expect(cell.get([1, 2]).get()).toBe(12);
		expect(cell.has([1, 2])).toBe(true);
		const plain = createFamily(scope, (key: unknown) => scope.signal$(null, key));
		expect(plain.get(NaN)).toBe(plain.get(NaN));
		expect(plain.get(0)).toBe(plain.get(-0));
		expect(plain.get([1])).not.toBe(plain.get([1]));
	});

	it('keeps families and their members per scope', () => {
		const left = owner('family-left');
		const right = owner('family-right');
		const leftRow = createFamily(left, (id: string) => left.signal$(null, `left ${id}`));
		const rightRow = createFamily(right, (id: string) => right.signal$(null, `right ${id}`));
		leftRow.get('a').set('changed');
		expect(rightRow.get('a').get()).toBe('right a');
		left.dispose();
		expect(rightRow.get('a').get()).toBe('right a');
		expect(() => leftRow.get('a')).toThrow(ScopeDisposedError);
	});

	it('holds derived members that read other members', () => {
		const scope = owner();
		const count = createFamily(scope, (_id: string) => scope.signal$(null, 1));
		let runs = 0;
		const doubled = createFamily(scope, (id: string) =>
			scope.derived$(null, () => {
				runs++;
				return count.get(id).get() * 2;
			}),
		);
		expect(doubled.get('a').get()).toBe(2);
		count.get('a').set(4);
		count.get('b').set(5);
		expect(doubled.get('a').get()).toBe(8);
		expect(runs).toBe(2);
	});

	it('retires an evicted member, and creates a fresh one for its key', () => {
		const scope = owner('family-evict');
		const row = createFamily(scope, (_id: string) => scope.signal$(null, 0));
		const label = createFamily(scope, (id: string) =>
			scope.derived$(null, () => `${id}=${row.get(id).get()}`),
		);
		const a$ = row.get('a');
		const label$ = label.get('a');
		a$.set(5);
		expect(label$.get()).toBe('a=5');

		expect(row.delete('a')).toBe(true);
		expect(row.delete('a')).toBe(false);
		expect(row.has('a')).toBe(false);
		expect(() => a$.get()).toThrow(ScopeDisposedError);
		expect(() => a$.set(1)).toThrow(ScopeDisposedError);
		expect(() => a$.subscribe(() => {})).toThrow(ScopeDisposedError);
		// The derived member read the evicted one, so it recomputes from a fresh member.
		expect(label$.get()).toBe('a=0');
		expect(row.get('a')).not.toBe(a$);

		expect(label.delete('a')).toBe(true);
		expect(() => label$.get()).toThrow(ScopeDisposedError);
		expect(label.get('a').get()).toBe('a=0');
		// Neighbouring members are untouched.
		row.get('b').set(2);
		expect(label.get('b').get()).toBe('b=2');
	});

	it.each([
		['cell', (scope: Scope) => scope.signal$(null, 1)],
		['derived', (scope: Scope) => scope.derived$(null, () => 1)],
	] as const)(
		'ends public subscriptions silently and invalidates renderer bindings once when a %s member is evicted',
		(_kind, create) => {
			const scope = owner();
			const family = createFamily(scope, (_id: string) => create(scope));
			const member$ = family.get('a');
			member$.get();
			const heard: string[] = [];
			member$.subscribe(() => heard.push('public'));
			member$[SIGNAL_BINDING_SUBSCRIBE](() => {
				heard.push('binding');
				expect(() => member$.get()).toThrow(ScopeDisposedError);
			});
			family.delete('a');
			expect(heard).toEqual(['binding']);
			// Recreating the key does not reach the old member's subscribers.
			family.get('a').get();
			expect(heard).toEqual(['binding']);
		},
	);

	// A cell's binding hears onRetire, as for its scope's retirement. A derived value
	// has no scope, so its binding is notified and then finds it retired.
	it.each([
		['cell', (scope: Scope) => scope.signal$(null, 1), 'retire'],
		['derived', (scope: Scope) => scope.derived$(null, () => 1), 'notify'],
	] as const)("reports a %s member's retirement to renderer bindings", (_kind, create, hears) => {
		const scope = owner();
		const family = createFamily(scope, (_id: string) => create(scope));
		const member$ = family.get('a');
		member$.get();
		const heard: string[] = [];
		member$[SIGNAL_BINDING_SUBSCRIBE](
			() => heard.push('notify'),
			() => heard.push('retire'),
		);
		const retired = () =>
			(member$ as unknown as Record<symbol, (() => boolean) | undefined>)[
				SIGNAL_BINDING_RETIRED
			]?.() === true;
		expect(retired()).toBe(false);
		family.delete('a');
		expect(heard).toEqual([hears]);
		expect(retired()).toBe(true);
		expect(() => member$.get()).toThrow(ScopeDisposedError);
		expect(() => member$.latest()).toThrow(ScopeDisposedError);
		expect(() => member$.snapshot()).toThrow(ScopeDisposedError);
		expect(() => member$.subscribe(() => {})).toThrow(ScopeDisposedError);
		expect(() => member$[SIGNAL_BINDING_SUBSCRIBE](() => {})).toThrow(ScopeDisposedError);
	});

	it.each([
		['cell', (scope: Scope, watched: () => () => void) => scope.signal$(null, 1, { watched })],
		[
			'derived',
			(scope: Scope, watched: () => () => void) => scope.derived$(null, () => 1, { watched }),
		],
	] as const)("ends an evicted %s member's watched hook", (_kind, create) => {
		const scope = owner();
		const log: string[] = [];
		const family = createFamily(scope, (_id: string) =>
			create(scope, () => {
				log.push('watched');
				return () => log.push('unwatched');
			}),
		);
		family.get('a').subscribe(() => {});
		expect(log).toEqual(['watched']);
		family.delete('a');
		expect(log).toEqual(['watched', 'unwatched']);
	});

	it.each([
		['cell', (scope: Scope) => scope.signal$(null, 1)],
		['derived', (scope: Scope) => scope.derived$(null, () => 1)],
	] as const)('tells a render that read a %s member it retired', (_kind, create) => {
		const scope = owner();
		const family = createFamily(scope, (_id: string) => create(scope));
		const member$ = family.get('a');
		let source: NativeReadSource | undefined;
		const previous = setNativeReadObserver((current) => {
			source = current;
		});
		try {
			member$.get();
		} finally {
			setNativeReadObserver(previous);
		}
		let notices = 0;
		source!.subscribe(() => notices++);
		expect(source!.retired?.() === true).toBe(false);
		family.delete('a');
		expect(notices).toBe(1);
		expect(source!.retired?.()).toBe(true);
		expect(() => source!.subscribe(() => {})).toThrow(ScopeDisposedError);
	});

	it('stops effects that read an evicted member, after their cleanup', () => {
		const scope = owner();
		const family = createFamily(scope, (_id: string) => scope.signal$(null, 1));
		const log: string[] = [];
		scope.effect(() => {
			log.push(`run ${family.get('a').get()}`);
			return () => log.push('cleanup');
		});
		const kept = family.get('b');
		let keptRuns = 0;
		scope.effect(() => {
			keptRuns++;
			kept.get();
		});
		family.delete('a');
		expect(log).toEqual(['run 1', 'cleanup', 'run 1']);
		expect(keptRuns).toBe(1);
	});

	it('evicts every member with clear, in one batch', () => {
		const scope = owner();
		const family = createFamily(scope, (_id: string) => scope.signal$(null, 1));
		const a$ = family.get('a');
		const b$ = family.get('b');
		let runs = 0;
		scope.effect(() => {
			runs++;
			try {
				a$.get();
				b$.get();
			} catch {}
		});
		family.clear();
		expect(family.size).toBe(0);
		expect(runs).toBe(2);
		expect(() => a$.get()).toThrow(ScopeDisposedError);
		expect(() => b$.get()).toThrow(ScopeDisposedError);
	});

	it('retires every member when its scope is disposed', () => {
		const scope = createScope({ scopeKey: 'family-disposed' });
		const source = owner('family-source');
		const base$ = source.signal$(null, 2);
		const family = createFamily(scope, (_id: string) =>
			scope.derived$(null, () => base$.get() * 2),
		);
		const heard: string[] = [];
		const member$ = family.get('a');
		expect(member$.get()).toBe(4);
		member$[SIGNAL_BINDING_SUBSCRIBE](() => heard.push('binding'));
		scope.dispose();
		expect(heard).toEqual(['binding']);
		expect(family.size).toBe(0);
		// A derived member of a retired scope stops answering even though its source lives on.
		expect(() => member$.get()).toThrow(ScopeDisposedError);
		base$.set(3);
		expect(() => member$.get()).toThrow(ScopeDisposedError);
	});

	it('evicts a member idle for the given time, unless a reader comes back', () => {
		vi.useFakeTimers();
		const scope = owner();
		const family = createFamily(scope, (_id: string) => scope.signal$(null, 1), { idle: 100 });
		const unread$ = family.get('unread');
		const read$ = family.get('read');
		const stop = read$.subscribe(() => {});
		vi.advanceTimersByTime(100);
		expect(family.has('unread')).toBe(false);
		expect(() => unread$.get()).toThrow(ScopeDisposedError);
		expect(family.get('read')).toBe(read$);

		stop();
		vi.advanceTimersByTime(60);
		// A reader that comes back and leaves again restarts the idle time.
		read$.subscribe(() => {})();
		vi.advanceTimersByTime(60);
		expect(family.get('read')).toBe(read$);
		vi.advanceTimersByTime(40);
		expect(family.has('read')).toBe(false);
	});

	it('keeps an idle member while an observed derived value reads it', () => {
		vi.useFakeTimers();
		const scope = owner();
		const base = createFamily(scope, (_id: string) => scope.signal$(null, 1), { idle: 10 });
		const view = createFamily(
			scope,
			(id: string) => scope.derived$(null, () => base.get(id).get() + 1),
			{ idle: 50 },
		);
		const view$ = view.get('a');
		const stop = view$.subscribe(() => {});
		expect(view$.get()).toBe(2);
		const base$ = base.get('a');
		vi.advanceTimersByTime(100);
		// Observed through the view, the base member stays.
		expect(base.get('a')).toBe(base$);
		expect(view.get('a')).toBe(view$);
		stop();
		// Both lose their observer together, and each idles out on its own time.
		vi.advanceTimersByTime(10);
		expect(base.has('a')).toBe(false);
		expect(view.has('a')).toBe(true);
		vi.advanceTimersByTime(40);
		expect(view.has('a')).toBe(false);
	});

	it("keeps a member's own watched hook alongside idle eviction", () => {
		vi.useFakeTimers();
		const scope = owner();
		const log: string[] = [];
		const family = createFamily(
			scope,
			(_id: string) =>
				scope.signal$(null, 1, {
					watched: () => {
						log.push('watched');
						return () => log.push('unwatched');
					},
				}),
			{ idle: 10 },
		);
		const stop = family.get('a').subscribe(() => {});
		vi.advanceTimersByTime(20);
		expect(family.has('a')).toBe(true);
		stop();
		expect(log).toEqual(['watched', 'unwatched']);
		vi.advanceTimersByTime(10);
		expect(family.has('a')).toBe(false);
	});

	it('keeps an observed member when its own watched hook throws', () => {
		vi.useFakeTimers();
		const report = vi.fn();
		const previous = globalThis.reportError;
		globalThis.reportError = report;
		try {
			const scope = owner();
			const family = createFamily(
				scope,
				(_id: string) =>
					scope.signal$(null, 1, {
						watched: () => {
							throw new Error('watched failed');
						},
					}),
				{ idle: 10 },
			);
			family.get('a').subscribe(() => {});
			vi.advanceTimersByTime(50);
			expect(report).toHaveBeenCalledOnce();
			expect(family.has('a')).toBe(true);
		} finally {
			globalThis.reportError = previous;
		}
	});

	it('answers scope.get and scope.set on an evicted cell with an error', () => {
		const scope = owner();
		const family = createFamily(scope, (_id: string) => scope.signal$(null, 1));
		const cell$ = family.get('a');
		family.delete('a');
		expect(() => cell$.get()).toThrow(ScopeDisposedError);
		expect(() => cell$.set(2)).toThrow(ScopeDisposedError);
		// The scope no longer owns it; checking for eviction here would cost every application.
		expect(() => scope.get(cell$)).toThrow(TypeError);
		expect(() => scope.set(cell$, 2)).toThrow(TypeError);
	});

	it("retires members after every effect's cleanup when the scope is disposed", () => {
		const scope = createScope({ scopeKey: 'family-dispose-order' });
		const cells = createFamily(scope, (_id: string) => scope.signal$(null, 1));
		const views = createFamily(scope, (id: string) =>
			scope.derived$(null, () => cells.get(id).get() * 10),
		);
		const cell$ = cells.get('a');
		const view$ = views.get('a');
		const log: unknown[] = [];
		// Created after both families' first members, so later in the effect ring.
		scope.effect(() => {
			view$.get();
			return () => log.push(cell$.get(), view$.get());
		});
		scope.dispose();
		expect(log).toEqual([1, 10]);
		expect(cells.size).toBe(0);
		expect(views.size).toBe(0);
		expect(() => view$.get()).toThrow(ScopeDisposedError);
	});

	it('does not keep an idle member for a derived value nothing observes', () => {
		vi.useFakeTimers();
		const scope = owner();
		const base = createFamily(scope, (_id: string) => scope.signal$(null, 1), { idle: 10 });
		const label$ = scope.derived$(null, () => base.get('a').get() + 1);
		expect(label$.get()).toBe(2);
		const base$ = base.get('a');
		base$.set(5);
		vi.advanceTimersByTime(10);
		expect(base.has('a')).toBe(false);
		// The polled reader recomputes against a new member.
		expect(label$.get()).toBe(2);
		expect(base.get('a')).not.toBe(base$);
	});

	it('evicts an idle derived member once its last reader leaves, after recomputing', () => {
		vi.useFakeTimers();
		const scope = owner();
		const count$ = scope.signal$(null, 1);
		const family = createFamily(
			scope,
			(_id: string) => scope.derived$(null, () => count$.get() * 2),
			{
				idle: 10,
			},
		);
		const member$ = family.get('a');
		const stop = scope.effect(() => void member$.get());
		count$.set(2);
		expect(member$.get()).toBe(4);
		vi.advanceTimersByTime(20);
		expect(family.get('a')).toBe(member$);
		stop();
		vi.advanceTimersByTime(10);
		expect(family.has('a')).toBe(false);
	});

	it('cancels idle eviction when the scope is disposed', () => {
		vi.useFakeTimers();
		const scope = createScope({ scopeKey: 'family-idle-disposed' });
		const family = createFamily(scope, (_id: string) => scope.signal$(null, 1), { idle: 10 });
		family.get('a');
		scope.dispose();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('keeps memory bounded under key churn', async () => {
		const scope = owner();
		const source$ = scope.signal$(null, 0);
		const family = createFamily(scope, (id: number) =>
			scope.derived$(null, () => source$.get() + id),
		);
		// Kept out of the async frame so no strong local outlives the call.
		const evicted = (() => {
			const refs: WeakRef<object>[] = [];
			for (let id = 0; id < 50; id++) {
				const member$ = family.get(id);
				expect(member$.get()).toBe(id);
				refs.push(new WeakRef(member$));
				family.delete(id);
			}
			return refs;
		})();
		await collectGarbage();
		// An evicted derived member let go of its dependencies, so its source no longer holds it.
		expect(evicted.filter((ref) => ref.deref() !== undefined)).toEqual([]);
		expect(family.size).toBe(0);
		source$.set(1);
	});

	it('lets a live scope drop a family once it has no members', async () => {
		const scope = owner();
		// Kept out of the async frame so no strong local outlives the call.
		const dropped = (() => {
			const family = createFamily(scope, (_id: string) => scope.signal$(null, 1));
			family.get('a');
			family.delete('a');
			return new WeakRef(family);
		})();
		await collectGarbage();
		expect(dropped.deref()).toBeUndefined();
	});

	it('rejects invalid arguments and members', () => {
		const scope = owner();
		const other = owner('family-other');
		expect(() => createFamily({} as Scope, () => scope.signal$(null, 1))).toThrow(TypeError);
		expect(() => createFamily(scope, null as never)).toThrow(TypeError);
		expect(() => createFamily(scope, () => scope.signal$(null, 1), { idle: -1 })).toThrow(
			TypeError,
		);
		expect(() => createFamily(scope, () => scope.signal$(null, 1), { idle: Infinity })).toThrow(
			TypeError,
		);
		expect(() => createFamily(scope, () => scope.signal$(null, 1), { keyOf: 1 as never })).toThrow(
			TypeError,
		);
		const shared$ = scope.signal$(null, 1);
		const sharing = createFamily(scope, (_id: string) => shared$);
		sharing.get('a');
		expect(() => sharing.get('b')).toThrow(TypeError);
		expect(() => createFamily(scope, (id: string) => scope.signal$(id, 1)).get('a')).toThrow(
			TypeError,
		);
		expect(() => createFamily(scope, (_id: string) => other.signal$(null, 1)).get('a')).toThrow(
			TypeError,
		);
		// An evicted member, cell or derived, is not admitted again.
		for (const cached$ of [scope.signal$(null, 1), scope.derived$(null, () => 1)]) {
			const caching = createFamily(scope, (_id: string) => cached$);
			caching.get('a');
			caching.delete('a');
			expect(() => caching.get('a')).toThrow(TypeError);
			expect(caching.size).toBe(0);
		}
		// A handle something already observes is not new.
		const observed$ = scope.derived$(null, () => 1);
		observed$.subscribe(() => {});
		expect(() => createFamily(scope, (_id: string) => observed$).get('a')).toThrow(TypeError);
		const dead = createScope({ scopeKey: 'family-dead' });
		dead.dispose();
		expect(() => createFamily(dead, () => dead.signal$(null, 1))).toThrow(ScopeDisposedError);
	});

	it('rejects eviction from inside a computation', () => {
		const scope = owner();
		const family = createFamily(scope, (_id: string) => scope.signal$(null, 1));
		family.get('a');
		const evicting$ = scope.derived$(null, () => family.delete('a'));
		expect(() => evicting$.get()).toThrow(SignalWriteError);
		expect(family.has('a')).toBe(true);
	});
});
