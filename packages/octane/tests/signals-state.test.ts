import { afterEach, describe, expect, it } from 'vitest';
import {
	createScope,
	ScopeDisposedError,
	SIGNAL_BINDING_SUBSCRIBE,
	SignalCycleError,
	SignalWriteError,
	type Scope,
} from 'octane/signals';
import { deferred } from './_fixtures/signals-async-controls';

const owners: Scope[] = [];
function owner(key = `state-${owners.length}`): Scope {
	const scope = createScope({ scopeKey: key });
	owners.push(scope);
	return scope;
}

afterEach(() => {
	for (const scope of owners.splice(0)) scope.dispose();
});

describe('keyless signals', () => {
	it('reads, writes and derives like keyed ones, with no room in the scope', () => {
		const scope = owner();
		const count$ = scope.signal$(null, 1);
		const doubled$ = scope.derived$(null, () => count$.get() * 2);
		const keyed$ = scope.derived$('keyed', () => doubled$.get() + 1);
		expect([count$.get(), doubled$.get(), keyed$.get()]).toEqual([1, 2, 3]);
		count$.set((value) => value + 1);
		expect([count$.get(), doubled$.get(), keyed$.get()]).toEqual([2, 4, 5]);
		expect(scope.get(count$)).toBe(2);
		scope.set(count$, 5);
		expect(doubled$.get()).toBe(10);
		expect(scope.inspect().nodes.map((node) => node.key)).toEqual(['keyed']);
	});

	it('computes a keyless derived value only when read after a change', () => {
		const scope = owner();
		const count$ = scope.signal$(null, 1);
		let runs = 0;
		const doubled$ = scope.derived$(null, () => (runs++, count$.get() * 2));
		expect(runs).toBe(0);
		expect(doubled$.get()).toBe(2);
		expect(doubled$.get()).toBe(2);
		count$.set(2);
		count$.set(3);
		expect(runs).toBe(1);
		expect(doubled$.get()).toBe(6);
		expect(runs).toBe(2);
	});

	it('tells subscribers and effects of keyless changes', () => {
		const scope = owner();
		const count$ = scope.signal$(null, 1);
		const parity$ = scope.derived$(null, () => count$.get() % 2);
		const heard: number[] = [];
		const ran: number[] = [];
		// A keyless derived value belongs to no scope, so its subscriptions end as
		// another scope's would: here, before its signal's scope retires.
		const stop = parity$.subscribe(() => heard.push(parity$.get()));
		scope.effect(() => {
			ran.push(parity$.get());
		});
		count$.set(3);
		count$.set(4);
		expect(heard).toEqual([0]);
		expect(ran).toEqual([1, 0]);
		stop();
	});

	it("rethrows a keyless computation's error until a dependency changes", () => {
		const scope = owner();
		const fail$ = scope.signal$(null, true);
		const error = new Error('failed');
		let runs = 0;
		const value$ = scope.derived$(null, () => {
			runs++;
			if (fail$.get()) throw error;
			return 'ok';
		});
		expect(() => value$.get()).toThrow(error);
		expect(() => value$.get()).toThrow(error);
		expect(runs).toBe(1);
		expect(value$.snapshot()).toMatchObject({ status: 'error', error });
		expect(value$.latest('fallback')).toBe('fallback');
		fail$.set(false);
		expect(value$.get()).toBe('ok');
	});

	it('rethrows a thrown thenable and computes again on the next read', () => {
		const scope = owner();
		const ready$ = scope.signal$(null, false);
		const waiting = new Promise<never>(() => {});
		let runs = 0;
		const value$ = scope.derived$(null, () => {
			runs++;
			if (!ready$.get()) throw waiting;
			return 'ready';
		});
		expect(() => value$.get()).toThrow();
		expect(value$.snapshot().status).toBe('pending');
		expect(runs).toBe(2);
		ready$.set(true);
		expect(value$.get()).toBe('ready');
	});

	it('reports cycles and rejects writes from keyless computations', () => {
		const scope = owner();
		const count$ = scope.signal$(null, 1);
		let cycle$: ReturnType<Scope['derived$']>;
		cycle$ = scope.derived$(null, () => cycle$.get());
		expect(() => cycle$.get()).toThrow(SignalCycleError);
		const writes$ = scope.derived$(null, () => {
			count$.set(2);
			return 1;
		});
		expect(() => writes$.get()).toThrow(SignalWriteError);
		// Declaring a keyed signal is a write too.
		const declares$ = scope.derived$(null, () => scope.signal$('declared', 0).get());
		expect(() => declares$.get()).toThrow(SignalWriteError);
		expect(count$.get()).toBe(1);
	});

	it('stops answering once its scope retires', () => {
		const scope = createScope({ scopeKey: 'keyless-retiring' });
		const count$ = scope.signal$(null, 1);
		scope.dispose();
		expect(() => count$.get()).toThrow(ScopeDisposedError);
		expect(() => count$.set(2)).toThrow(ScopeDisposedError);
		expect(() => scope.signal$(null, 1)).toThrow(ScopeDisposedError);
	});

	it('keeps a keyed computation that reads a keyless value of another scope tied to that scope', () => {
		const shared = owner('keyless-shared');
		const view = owner('keyless-view');
		const secret$ = shared.signal$(null, 'old account');
		const blocked$ = view.signal$('blocked', false);
		const card$ = view.derived$('card', () => {
			if (blocked$.get()) throw new Error('blocked');
			return secret$.get();
		});
		expect(card$.get()).toBe('old account');
		blocked$.set(true);
		expect(card$.latest(null)).toBe('old account');
		shared.dispose();
		expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
	});
});

describe('scope effects', () => {
	it('runs at once and again after each batch that changes what it read', () => {
		const scope = owner();
		const count$ = scope.signal$('count', 1);
		const doubled$ = scope.derived$('doubled', () => count$.get() * 2);
		const seen: number[] = [];
		scope.effect(() => {
			seen.push(doubled$.get());
		});
		expect(seen).toEqual([2]);
		count$.set(2);
		expect(seen).toEqual([2, 4]);
		scope.batch(() => {
			count$.set(3);
			count$.set(4);
		});
		expect(seen).toEqual([2, 4, 8]);
		// A change that leaves what it read equal does not run it.
		const parity$ = scope.derived$('parity', () => count$.get() % 2);
		const parities: number[] = [];
		scope.effect(() => {
			parities.push(parity$.get());
		});
		count$.set(6);
		expect(parities).toEqual([0]);
	});

	it('follows the reads of its latest run only', () => {
		const scope = owner();
		const useA$ = scope.signal$('useA', true);
		const a$ = scope.signal$('a', 'a1');
		const b$ = scope.signal$('b', 'b1');
		const seen: string[] = [];
		scope.effect(() => {
			seen.push(useA$.get() ? a$.get() : b$.get());
		});
		useA$.set(false);
		a$.set('a2');
		b$.set('b2');
		expect(seen).toEqual(['a1', 'b1', 'b2']);
	});

	it('cleans up before each run and when stopped, and never runs after', () => {
		const scope = owner();
		const count$ = scope.signal$('count', 0);
		const log: string[] = [];
		const stop = scope.effect(() => {
			const value = count$.get();
			log.push(`run ${value}`);
			return () => log.push(`clean ${value}`);
		});
		count$.set(1);
		stop();
		stop();
		count$.set(2);
		expect(log).toEqual(['run 0', 'clean 0', 'run 1', 'clean 1']);
	});

	it('may write signals, and its writes reach other readers in the same delivery', () => {
		const scope = owner();
		const source$ = scope.signal$('source', 1);
		const mirror$ = scope.signal$('mirror', 0);
		const mirrored: number[] = [];
		scope.effect(() => {
			mirror$.set(source$.get() * 10);
		});
		scope.effect(() => {
			mirrored.push(mirror$.get());
		});
		source$.set(2);
		expect(mirror$.get()).toBe(20);
		expect(mirrored).toEqual([10, 20]);
	});

	it('stops with its scope after its cleanup reads current values', () => {
		const scope = createScope({ scopeKey: 'effect-retiring' });
		const count$ = scope.signal$('count', 1);
		const cleaned: number[] = [];
		scope.effect(() => {
			count$.get();
			return () => cleaned.push(count$.get());
		});
		scope.dispose();
		expect(cleaned).toEqual([1]);
	});

	it('ends silently once an owner it reads retires', () => {
		const shared = owner('effect-shared');
		const view = owner('effect-view');
		const value$ = shared.signal$('value', 1);
		const seen: number[] = [];
		view.effect(() => {
			seen.push(value$.get());
		});
		expect(() => shared.dispose()).not.toThrow();
		expect(seen).toEqual([1]);
		expect(view.retired).toBe(false);
	});

	it('is rejected inside a computation and with something other than a function', () => {
		const scope = owner();
		const value$ = scope.signal$('value', 1);
		const inside$ = scope.derived$('inside', () => {
			scope.effect(() => {});
			return value$.get();
		});
		expect(() => inside$.get()).toThrow(SignalWriteError);
		expect(() => scope.effect(1 as never)).toThrow(TypeError);
		const retired = createScope({ scopeKey: 'effect-after-dispose' });
		retired.dispose();
		expect(() => retired.effect(() => {})).toThrow(ScopeDisposedError);
	});

	it('runs every effect a write reaches when one of them throws, then reports the error', () => {
		const scope = owner();
		const count$ = scope.signal$('count', 0);
		const error = new Error('effect failed');
		const seen: number[] = [];
		scope.effect(() => {
			if (count$.get() === 1) throw error;
		});
		scope.effect(() => {
			seen.push(count$.get());
		});
		expect(() => count$.set(1)).toThrow(error);
		expect(seen).toEqual([0, 1]);
	});

	it('runs again after its cleanup threw', () => {
		const scope = owner();
		const count$ = scope.signal$(null, 0);
		const error = new Error('cleanup failed');
		const seen: number[] = [];
		scope.effect(() => {
			const count = count$.get();
			seen.push(count);
			return () => {
				if (count === 0) throw error;
			};
		});
		expect(() => count$.set(1)).toThrow(error);
		count$.set(2);
		expect(seen).toEqual([0, 2]);
	});

	it.each([
		[
			'effect',
			(shared: Scope, read: () => unknown, log: string[]) => {
				shared.effect(() => {
					log.push(`run ${String(read())}`);
					return () => log.push('cleanup');
				});
			},
		],
		[
			'keyless derived',
			(shared: Scope, read: () => unknown, log: string[]) => {
				const derived$ = shared.derived$(null, read);
				shared.effect(() => {
					log.push(`run ${String(derived$.get())}`);
					return () => log.push('cleanup');
				});
			},
		],
	] as const)(
		"stops another scope's %s that read a keyless signal when that signal's scope is disposed",
		(_, observe) => {
			const view = owner('keyless-retired-view');
			const shared = owner('keyless-retired-shared');
			const draft$ = view.signal$(null, 'draft');
			const log: string[] = [];
			observe(shared, () => draft$.get(), log);
			expect(log).toEqual(['run draft']);
			view.dispose();
			expect(log).toEqual(['run draft', 'cleanup']);
			shared.dispose();
			expect(log).toEqual(['run draft', 'cleanup']);
		},
	);
});

describe('scoped synchronous signals', () => {
	it('returns immutable snapshots that remain stable after later writes', () => {
		const scope = owner();
		const value$ = scope.signal$('value', 1);
		const before = value$.snapshot();
		expect(Object.isFrozen(before)).toBe(true);
		value$.set(2);
		expect(before).toMatchObject({ status: 'ready', value: 1 });
		expect(value$.snapshot()).toMatchObject({ status: 'ready', value: 2 });
	});

	it('reads writes immediately, including through derived values inside a batch', () => {
		const scope = owner();
		const count$ = scope.signal$('count', 1);
		const doubled$ = scope.derived$('doubled', () => scope.get(count$) * 2);
		const observed: number[] = [];
		const stop = doubled$.subscribe(() => observed.push(doubled$.get()));
		expect(doubled$.get()).toBe(2);
		expect(observed).toEqual([]);
		scope.batch(() => {
			scope.set(count$, 2);
			expect(scope.get(count$)).toBe(2);
			expect(scope.get(doubled$)).toBe(4);
			count$.set((value) => value + 1);
			expect(scope.get(doubled$)).toBe(6);
			expect(observed).toEqual([]);
		});
		expect(observed).toEqual([6]);
		stop();
	});

	it('keeps diamond projections coherent and switches conditional dependencies', () => {
		const scope = owner();
		const input$ = scope.signal$('input', 2);
		const alternate$ = scope.signal$('alternate', 20);
		const choose$ = scope.signal$('choose', true);
		const left$ = scope.derived$('left', () => scope.get(input$) + 1);
		const right$ = scope.derived$('right', () => scope.get(input$) * 3);
		const result$ = scope.derived$('result', () =>
			scope.get(choose$) ? [scope.get(left$), scope.get(right$)] : [scope.get(alternate$)],
		);
		const observed: number[][] = [];
		result$.subscribe(() => observed.push(result$.get()));
		input$.set(4);
		choose$.set(false);
		input$.set(100);
		alternate$.set(30);
		expect(observed).toEqual([[5, 12], [20], [30]]);
		choose$.set(true);
		expect(result$.get()).toEqual([101, 300]);
	});

	it.each(['value', null])('uses Object.is equality for NaN and signed zero (key %s)', (key) => {
		const scope = owner();
		const value$ = scope.signal$(key, Number.NaN);
		const values: number[] = [];
		value$.subscribe(() => values.push(value$.get()));
		let runs = 0;
		scope.effect(() => {
			value$.get();
			runs++;
		});
		value$.set(Number.NaN);
		// A batch that ends where it began tells a subscriber nothing.
		scope.batch(() => {
			value$.set(1);
			value$.set(Number.NaN);
		});
		expect(values).toEqual([]);
		expect(runs).toBe(2);
		value$.set(0);
		value$.set(-0);
		expect(values).toHaveLength(2);
		expect(Object.is(values[0], 0)).toBe(true);
		expect(Object.is(values[1], -0)).toBe(true);
	});

	it.each(['parity', null])(
		'does not rerun readers of a derived value that recomputes equal (key %s)',
		(key) => {
			const scope = owner();
			const count$ = scope.signal$(key && 'count', 1);
			const parity$ = scope.derived$(key, () =>
				scope.get(count$) < 0 ? Number.NaN : scope.get(count$) % 2,
			);
			const runs: number[] = [];
			const label$ = scope.derived$('label', () => {
				const parity = scope.get(parity$);
				runs.push(parity);
				return parity;
			});
			const stop = label$.subscribe(() => {});
			expect(label$.get()).toBe(1);
			for (const count of [3, -1, -3, 2, 4, 6]) count$.set(count);
			expect(runs).toEqual([1, Number.NaN, 0]);
			stop();
		},
	);

	it('does not turn undefined, null, empty text, or false into pending', () => {
		const scope = owner();
		for (const [index, value] of [undefined, null, '', false].entries()) {
			const value$ = scope.signal$(`value-${index}`, value);
			expect(value$.snapshot()).toMatchObject({ status: 'ready', value });
			expect(scope.isPending(() => value$.get())).toBe(false);
		}
	});

	it('groups nested actions, preserves this and arguments, and does not roll back on throw', () => {
		const scope = owner();
		const count$ = scope.signal$('count', 0);
		const source$ = scope.signal$('source', 'initial');
		const view$ = scope.derived$('view', () => `${count$.get()}:${source$.get()}`);
		const values: string[] = [];
		view$.subscribe(() => values.push(view$.get()));
		const update = scope.action(function (this: { step: number }, label: string) {
			count$.set((value) => value + this.step);
			scope.batch(() => source$.set(label));
			return count$.get();
		});
		expect(update.call({ step: 3 }, 'user')).toBe(3);
		expect(values).toEqual(['3:user']);
		const error = new Error('event failed after accepting writes');
		expect(() =>
			scope.batch(() => {
				count$.set(4);
				source$.set('accepted');
				throw error;
			}),
		).toThrow(error);
		expect(view$.get()).toBe('4:accepted');
		expect(values).toEqual(['3:user', '4:accepted']);
	});

	it('ends an action batch at its synchronous boundary, not across await', async () => {
		const scope = owner();
		const count$ = scope.signal$('count', 0);
		const values: number[] = [];
		count$.subscribe(() => values.push(count$.get()));
		const run = scope.action(async () => {
			count$.set(1);
			count$.set(2);
			await Promise.resolve();
			count$.set(3);
			count$.set(4);
		});
		const pending = run();
		expect(values).toEqual([2]);
		await pending;
		expect(values).toEqual([2, 3, 4]);
	});

	it.each([
		{ edit: 'new text', stored: 'older saved text', expectedSource: 'input' },
		{ edit: '', stored: 'older saved text', expectedSource: 'input' },
		{ edit: undefined, stored: '', expectedSource: 'storage' },
	])(
		'applies a delayed draft only when its captured edit revision is current: $edit',
		async ({ edit, stored, expectedSource }) => {
			const scope = owner('draft');
			const text$ = scope.signal$('text', 'initial text');
			const revision$ = scope.signal$('revision', 0);
			const source$ = scope.signal$('source', 'initial');
			const draft$ = scope.derived$('draft', () => ({ text: text$.get(), source: source$.get() }));
			const observed: { text: string; source: string }[] = [];
			draft$.subscribe(() => observed.push(draft$.get()));
			const storage = deferred<string>();
			const applyStored = scope.action((text: string, revision: number) => {
				if (revision$.get() !== revision) return;
				text$.set(text);
				source$.set('storage');
			});
			const restore = async () => {
				const epoch = scope.epoch;
				const revision = revision$.get();
				const text = await storage.promise;
				if (!scope.retired && scope.epoch === epoch) applyStored(text, revision);
			};
			const restoration = restore();
			if (edit !== undefined) {
				const applyInput = scope.action((text: string) => {
					revision$.set((revision) => revision + 1);
					text$.set(text);
					source$.set('input');
				});
				applyInput(edit);
			}
			storage.resolve(stored);
			await restoration;
			const expected = { text: edit ?? stored, source: expectedSource };
			expect(draft$.get()).toEqual(expected);
			expect(observed).toEqual([expected]);
			expect(revision$.get()).toBe(edit === undefined ? 0 : 1);
		},
	);

	it('hands a draft snapshot to a new owner without transferring the old restore operation', async () => {
		const original = owner('draft-owner');
		const original$ = original.signal$('draft', { text: 'current edit', revision: 3 });
		const storage = deferred<string>();
		const restore = async () => {
			const epoch = original.epoch;
			const revision = original$.get().revision;
			const text = await storage.promise;
			if (original.retired || original.epoch !== epoch) return;
			original.batch(() => {
				if (original$.get().revision === revision) original$.set({ text, revision });
			});
		};
		const restoration = restore();
		const replacement = owner('draft-owner');
		const replacement$ = replacement.signal$('draft', original$.get());
		original.dispose();
		replacement$.set({ text: 'new owner edit', revision: 4 });
		storage.resolve('obsolete storage');
		await restoration;
		expect(replacement$.get()).toEqual({ text: 'new owner edit', revision: 4 });
		expect(() => original$.set({ text: 'late write', revision: 5 })).toThrow(ScopeDisposedError);
		expect(replacement$.get()).toEqual({ text: 'new owner edit', revision: 4 });
	});

	it('keeps actions tracked when used to group a pure read', () => {
		const scope = owner();
		const count$ = scope.signal$('count', 1);
		const read = scope.action(() => count$.get());
		const result$ = scope.derived$('result', () => read() * 2);
		expect(result$.get()).toBe(2);
		count$.set(3);
		expect(result$.get()).toBe(6);
	});

	it('rejects writes from derived and updater functions and restores the guard after errors', () => {
		const scope = owner();
		const count$ = scope.signal$('count', 1);
		const other$ = scope.signal$('other', 10);
		const invalid$ = scope.derived$('invalid', () => {
			other$.set(11);
			return count$.get();
		});
		expect(() => invalid$.get()).toThrow(SignalWriteError);
		expect(() =>
			count$.set(() => {
				other$.set(12);
				return 2;
			}),
		).toThrow(SignalWriteError);
		expect(count$.get()).toBe(1);
		expect(other$.get()).toBe(10);
		count$.set(3);
		expect(count$.get()).toBe(3);
	});

	it('restores dependency tracking after a thrown computation and can recover through an input', () => {
		const scope = owner();
		const fail$ = scope.signal$('fail', true);
		const input$ = scope.signal$('input', 4);
		const error = new Error('unavailable calculation');
		const result$ = scope.derived$('result', () => {
			if (fail$.get()) throw error;
			return input$.get() * 2;
		});
		expect(() => result$.get()).toThrow(error);
		expect(() => scope.isPending(() => result$.get())).toThrow(error);
		fail$.set(false);
		expect(result$.get()).toBe(8);
		input$.set(5);
		expect(result$.get()).toBe(10);
	});

	it('retains a whole successful result through errors but exposes the error separately', () => {
		const scope = owner();
		const selected$ = scope.signal$('selected', 'a');
		const fail$ = scope.signal$('fail', false);
		const error = new Error('failed selection');
		const card$ = scope.derived$('card', () => {
			if (fail$.get()) throw error;
			return { id: selected$.get(), title: `Todo ${selected$.get()}` };
		});
		expect(card$.latest(null)).toEqual({ id: 'a', title: 'Todo a' });
		scope.batch(() => {
			selected$.set('b');
			fail$.set(true);
		});
		expect(card$.latest(null)).toEqual({ id: 'a', title: 'Todo a' });
		expect(card$.snapshot()).toMatchObject({ status: 'error', error });
		fail$.set(false);
		expect(card$.get()).toEqual({ id: 'b', title: 'Todo b' });
	});

	it('shares only by actual scope instance and rejects wrong-owner access', () => {
		const first = owner('same-key');
		const second = owner('same-key');
		const a$ = first.signal$('value', 1);
		const b$ = second.signal$('value', 2);
		a$.set(3);
		expect(b$.get()).toBe(2);
		expect(() => second.get(a$)).toThrow(/owning scope/);
		expect(() => second.set(a$, 4)).toThrow(/owning scope/);
		expect(a$.get()).toBe(3);
	});

	it('supports cross-scope dependencies without giving a consumer ownership of its producer', () => {
		const shared = owner('shared');
		const view = owner('view');
		const value$ = shared.signal$('value', 2);
		const projection$ = view.derived$('projection', () => shared.get(value$) * 2);
		expect(projection$.get()).toBe(4);
		view.dispose();
		value$.set(3);
		expect(value$.get()).toBe(3);
		expect(() => projection$.latest(null)).toThrow(ScopeDisposedError);
	});

	it('does not let a retained result hide a dependency owner retiring', () => {
		const shared = owner('shared');
		const view = owner('view');
		const secret$ = shared.signal$('secret', 'old account');
		const card$ = view.derived$('card', () => ({ value: secret$.get() }));
		expect(card$.get()).toEqual({ value: 'old account' });
		shared.dispose();
		expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
	});

	it('stops retaining a foreign value once another dependency owner retires', () => {
		const data = owner('retained-data');
		const gate = owner('retiring-gate');
		const view = owner('retaining-view');
		const value$ = data.signal$('value', 'private value');
		const reason$ = gate.signal$('reason', 'closed');
		const blocked$ = view.signal$('blocked', false);
		const card$ = view.derived$('card', () => {
			if (blocked$.get()) throw new Error(reason$.get());
			return value$.get();
		});
		let notifications = 0;
		card$.subscribe(() => notifications++);
		expect(card$.get()).toBe('private value');
		blocked$.set(true);
		expect(card$.latest(null)).toBe('private value');

		gate.dispose();
		expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
		const delivered = notifications;
		// The view no longer reads or retains the data owner's value, so that
		// owner retiring later is not another change to the card.
		data.dispose();
		expect(notifications).toBe(delivered);
		expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
	});

	it.each([
		{ blocked: 'pending', indirect: false, again: false },
		{ blocked: 'error', indirect: false, again: false },
		{ blocked: 'pending', indirect: true, again: false },
		{ blocked: 'error', indirect: true, again: false },
		// The last successful computation read the foreign value again, once it was current.
		{ blocked: 'pending', indirect: false, again: true },
		{ blocked: 'error', indirect: true, again: true },
	] as const)(
		'revokes a retained foreign value after a $blocked branch stops reading it (indirect=$indirect, again=$again)',
		({ blocked, indirect, again }) => {
			const shared = owner('private-data');
			const intermediate = owner('intermediate');
			const view = owner('view');
			const secret$ = shared.signal$('secret', 'old account');
			const source$ = indirect ? intermediate.derived$('source', () => secret$.get()) : secret$;
			const unavailable$ = view.signal$('unavailable', false);
			const revision$ = view.signal$('revision', 0);
			const failure =
				blocked === 'pending' ? new Promise<never>(() => {}) : new Error('not available');
			const card$ = view.derived$('card', () => {
				if (unavailable$.get()) throw failure;
				return { value: source$.get(), revision: revision$.get() };
			});
			const observed: unknown[] = [];
			card$.subscribe(() => {
				const snapshot = card$.snapshot();
				observed.push(snapshot.status === 'error' ? snapshot.error : snapshot.status);
			});
			expect(card$.get()).toEqual({ value: 'old account', revision: 0 });
			if (again) {
				revision$.set(1);
				expect(card$.get()).toEqual({ value: 'old account', revision: 1 });
			}
			const retained = { value: 'old account', revision: again ? 1 : 0 };
			unavailable$.set(true);
			expect(card$.snapshot().status).toBe(blocked);
			expect(card$.latest(null)).toEqual(retained);

			shared.dispose();

			expect(observed.at(-1)).toBeInstanceOf(ScopeDisposedError);
			expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
			expect(card$.snapshot()).toMatchObject({
				status: 'error',
				error: expect.any(ScopeDisposedError),
			});
		},
	);

	it('revokes a foreign value that a computation started reading after a local one', () => {
		const shared = owner('started-data');
		const view = owner('started-view');
		const secret$ = shared.signal$('secret', 'old account');
		const foreign$ = view.signal$('foreign', false);
		const blocked$ = view.signal$('blocked', false);
		const card$ = view.derived$('card', () => {
			if (blocked$.get()) throw new Error('blocked');
			return foreign$.get() ? secret$.get() : 'local';
		});
		// Current already, so the computation reads it as a plain value.
		expect(secret$.get()).toBe('old account');
		expect(card$.get()).toBe('local');
		foreign$.set(true);
		expect(card$.get()).toBe('old account');
		blocked$.set(true);
		expect(card$.latest(null)).toBe('old account');

		shared.dispose();

		expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
	});

	it('releases an old foreign lifetime after a whole replacement succeeds', () => {
		const previous = owner('previous');
		const replacement = owner('replacement');
		const view = owner('view');
		const previous$ = previous.signal$('label', 'old account');
		const replacement$ = replacement.signal$('label', 'new account');
		const selectReplacement$ = view.signal$('replacement', false);
		const unavailable$ = view.signal$('unavailable', false);
		const card$ = view.derived$('card', () => {
			if (unavailable$.get()) throw new Error('waiting for replacement');
			return { value: selectReplacement$.get() ? replacement$.get() : previous$.get() };
		});
		expect(card$.get()).toEqual({ value: 'old account' });
		unavailable$.set(true);
		expect(card$.latest(null)).toEqual({ value: 'old account' });
		view.batch(() => {
			selectReplacement$.set(true);
			unavailable$.set(false);
		});
		expect(card$.get()).toEqual({ value: 'new account' });
		previous.dispose();
		expect(card$.latest(null)).toEqual({ value: 'new account' });
		replacement$.set('updated account');
		expect(card$.get()).toEqual({ value: 'updated account' });
	});

	it('updates foreign lifetime ownership even when a replacement value compares equal', () => {
		const previous = owner('previous-equal');
		const replacement = owner('replacement-equal');
		const view = owner('view-equal');
		const previous$ = previous.signal$('label', 'same text');
		const replacement$ = replacement.signal$('label', 'same text');
		const selectReplacement$ = view.signal$('replacement', false);
		const label$ = view.derived$('label', () =>
			selectReplacement$.get() ? replacement$.get() : previous$.get(),
		);
		expect(label$.get()).toBe('same text');
		selectReplacement$.set(true);
		expect(label$.get()).toBe('same text');
		previous.dispose();
		expect(label$.latest(null)).toBe('same text');
		replacement.dispose();
		expect(() => label$.latest(null)).toThrow(ScopeDisposedError);
	});

	it('carries revocation through a ready projection that samples a retained foreign value', () => {
		const data = owner('data');
		const presentation = owner('presentation');
		const consumer = owner('consumer');
		const value$ = data.signal$('value', 'private value');
		const unavailable$ = presentation.signal$('unavailable', false);
		const held$ = presentation.derived$('held', () => {
			if (unavailable$.get()) throw new Error('unavailable');
			return value$.get();
		});
		const card$ = consumer.derived$('card', () => ({ title: held$.latest('loading') }));
		expect(card$.get()).toEqual({ title: 'private value' });
		unavailable$.set(true);
		expect(card$.get()).toEqual({ title: 'private value' });
		data.dispose();
		expect(() => card$.latest(null)).toThrow(ScopeDisposedError);
	});

	it('ends public subscriptions silently and makes cleanup and retirement idempotent', () => {
		const scope = owner();
		const value$ = scope.signal$('value', 0);
		const values: number[] = [];
		const stop = value$.subscribe(() => values.push(value$.get()));
		value$.set(1);
		stop();
		stop();
		value$.set(2);
		value$.subscribe(() => values.push(value$.get()));
		const epoch = scope.epoch;
		scope.dispose();
		scope.dispose();
		expect(values).toEqual([1]);
		expect(scope.epoch).toBe(epoch + 1);
		expect(() => value$.get()).toThrow(ScopeDisposedError);
		expect(() => value$.set(3)).toThrow(ScopeDisposedError);
		expect(() => value$.subscribe(() => {})).toThrow(ScopeDisposedError);
	});

	it('tells a binding of each write once, however far the change travels', () => {
		const scope = owner();
		const count$ = scope.signal$('count', 1);
		const doubled$ = scope.derived$('doubled', () => count$.get() * 2);
		const label$ = scope.derived$('label', () => `${doubled$.get()} and ${count$.get()}`);
		expect(label$.get()).toBe('2 and 1');
		const heard: string[] = [];
		const stops = [
			count$[SIGNAL_BINDING_SUBSCRIBE](() => heard.push('count')),
			doubled$[SIGNAL_BINDING_SUBSCRIBE](() => heard.push('doubled')),
			label$[SIGNAL_BINDING_SUBSCRIBE](() => heard.push('label')),
		];
		count$.set(2);
		expect(heard.sort()).toEqual(['count', 'doubled', 'label']);
		// A binding reads what it was told of before it hears of it again.
		expect(label$.get()).toBe('4 and 2');
		heard.length = 0;
		// One batch delivers once, after its last write.
		scope.batch(() => {
			count$.set(3);
			count$.set(4);
			expect(heard).toEqual([]);
		});
		expect(heard.sort()).toEqual(['count', 'doubled', 'label']);
		expect(label$.get()).toBe('8 and 4');
		for (const stop of stops) stop();
		heard.length = 0;
		count$.set(5);
		expect(heard).toEqual([]);
	});

	it('delivers accepted updates to remaining subscribers when one callback throws', () => {
		const scope = owner();
		const value$ = scope.signal$('value', 0);
		const error = new Error('presenter failed');
		const values: number[] = [];
		const stop = value$.subscribe(() => {
			throw error;
		});
		value$.subscribe(() => values.push(value$.get()));
		expect(() => value$.set(1)).toThrow(error);
		expect(values).toEqual([1]);
		stop();
		value$.set(2);
		expect(values).toEqual([1, 2]);
	});

	it('accepts a reentrant subscriber update as the next observable update', () => {
		const scope = owner();
		const value$ = scope.signal$('value', 0);
		const values: number[] = [];
		value$.subscribe(() => {
			const value = value$.get();
			values.push(value);
			if (value === 1) value$.set(2);
		});
		value$.set(1);
		expect(values).toEqual([1, 2]);
	});

	it('reports cycles and rejects async derived callbacks without corrupting later reads', () => {
		const scope = owner();
		const base$ = scope.signal$('base', 1);
		let cycle$: ReturnType<Scope['derived$']>;
		cycle$ = scope.derived$('cycle', () => cycle$.get());
		expect(() => cycle$.get()).toThrow(SignalCycleError);
		const async$ = scope.derived$('async', (async () => 1) as never);
		expect(() => async$.get()).toThrow(/synchronous/);
		base$.set(2);
		expect(base$.get()).toBe(2);
	});

	it('wakes a waiter on a pending computation once a dependency changes', async () => {
		const scope = owner();
		const gate$ = scope.signal$('gate', true);
		const value$ = scope.derived$('value', () => {
			if (gate$.get()) throw new Promise<never>(() => {});
			return 1;
		});
		let waiting: unknown;
		try {
			value$.get();
		} catch (thrown) {
			waiting = thrown;
		}
		expect(typeof (waiting as PromiseLike<unknown>)?.then).toBe('function');
		gate$.set(false);
		const woken = Promise.resolve(waiting).then(() => 'woken');
		const still = new Promise((resolve) => setTimeout(() => resolve('waiting'), 50));
		await expect(Promise.race([woken, still])).resolves.toBe('woken');
		expect(value$.get()).toBe(1);
	});

	it('refuses a write to a derived value that holds a plain value', () => {
		const scope = owner();
		const value$ = scope.signal$('value', 1);
		const doubled$ = scope.derived$('doubled', () => value$.get() * 2);
		expect(doubled$.get()).toBe(2);
		value$.set(2);
		expect(doubled$.get()).toBe(4);
		const writable = doubled$ as unknown as { set(value: number): void };
		expect(() => writable.set(10)).toThrow(TypeError);
		expect(doubled$.get()).toBe(4);
	});

	it('reports a cycle that only a later computation makes', () => {
		const scope = owner();
		const loop$ = scope.signal$('loop', false);
		let cycle$: ReturnType<Scope['derived$']>;
		cycle$ = scope.derived$('cycle', () => (loop$.get() ? cycle$.get() : 1));
		expect(cycle$.get()).toBe(1);
		loop$.set(true);
		expect(() => cycle$.get()).toThrow(SignalCycleError);
		loop$.set(false);
		expect(cycle$.get()).toBe(1);
	});

	it('rejects duplicate and empty keys instead of merging unrelated nodes', () => {
		expect(() => createScope({ scopeKey: '' })).toThrow(/nonempty/);
		const scope = owner();
		scope.signal$('same', 1);
		expect(() => scope.derived$('same', () => 2)).toThrow(/already exists/);
		expect(() => scope.signal$('', 1)).toThrow(/nonempty/);
	});
});

describe('equals', () => {
	type Point = { x: number; y: number };
	const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
	const sameItems = (a: readonly number[], b: readonly number[]) =>
		a.length === b.length && a.every((item, index) => Object.is(item, b[index]));

	for (const key of ['point', null]) {
		const kind = key === null ? 'keyless' : 'keyed';

		it(`keeps a ${kind} signal's value when equals finds a write equal`, () => {
			const scope = owner();
			const compared: [Point, Point][] = [];
			const initial = { x: 1, y: 2 };
			const point$ = scope.signal$(key, initial, {
				equals: (previous, next) => {
					compared.push([previous, next]);
					return samePoint(previous, next);
				},
			});
			const runs: Point[] = [];
			const label$ = scope.derived$(null, () => {
				runs.push(point$.get());
				return `${point$.get().x},${point$.get().y}`;
			});
			const notified: string[] = [];
			point$.subscribe(() => notified.push('subscriber'));
			scope.effect(() => {
				notified.push(`effect ${label$.get()}`);
			});

			const copy = { x: 1, y: 2 };
			point$.set(copy);
			scope.set(point$, (previous) => ({ ...previous }));
			expect(point$.get()).toBe(initial);
			expect(compared[0]).toEqual([initial, copy]);
			expect(compared[0]![0]).toBe(initial);
			expect(compared[0]![1]).toBe(copy);
			expect(notified).toEqual(['effect 1,2']);
			expect(runs).toHaveLength(1);

			// Object.is-equal values are never compared.
			compared.length = 0;
			point$.set(initial);
			expect(compared).toEqual([]);

			const moved = { x: 3, y: 2 };
			point$.set(moved);
			expect(point$.get()).toBe(moved);
			expect(notified).toEqual(['effect 1,2', 'subscriber', 'effect 3,2']);
		});

		it(`keeps a ${kind} derived value's reference when equals finds a result equal`, () => {
			const scope = owner();
			const items$ = scope.signal$(null, [3, 1, 2]);
			const evens$ = scope.derived$(key, () => items$.get().filter((item) => item % 2 === 0), {
				equals: sameItems,
			});
			let downstream = 0;
			const total$ = scope.derived$(null, () => {
				downstream++;
				return evens$.get().reduce((sum, item) => sum + item, 0);
			});
			const notified: number[] = [];
			// A keyless derived value's subscription ends before its signal's scope retires.
			const stop = evens$.subscribe(() => notified.push(total$.get()));
			const first = evens$.get();
			expect(total$.get()).toBe(2);

			items$.set([5, 2, 7]);
			expect(evens$.get()).toBe(first);
			expect(total$.get()).toBe(2);
			expect(downstream).toBe(1);
			expect(notified).toEqual([]);

			items$.set([4, 2]);
			expect(evens$.get()).toEqual([4, 2]);
			expect(notified).toEqual([6]);
			expect(downstream).toBe(2);
			stop();
		});

		it(`batches equal and unequal writes to a ${kind} signal`, () => {
			const scope = owner();
			const point$ = scope.signal$(key, { x: 0, y: 0 }, { equals: samePoint });
			const notified: Point[] = [];
			point$.subscribe(() => notified.push(point$.get()));
			scope.batch(() => {
				point$.set({ x: 0, y: 0 });
				point$.set({ x: 0, y: 0 });
			});
			expect(notified).toEqual([]);
			scope.batch(() => {
				point$.set({ x: 1, y: 0 });
				point$.set({ x: 1, y: 0 });
			});
			expect(notified).toEqual([{ x: 1, y: 0 }]);
		});
	}

	for (const key of ['copy', null]) {
		it(`computes a ${key === null ? 'keyless' : 'keyed'} derived value's first result, and its first after a failure, without equals`, () => {
			const scope = owner();
			const fail$ = scope.signal$(null, false);
			const items$ = scope.signal$(null, [1]);
			const copy$ = scope.derived$(
				key,
				() => {
					if (fail$.get()) throw new Error('failed');
					return [...items$.get()];
				},
				{ equals: () => true },
			);
			const first = copy$.get();
			expect(first).toEqual([1]);
			items$.set([2]);
			expect(copy$.get()).toBe(first);
			fail$.set(true);
			expect(() => copy$.get()).toThrow('failed');
			fail$.set(false);
			expect(copy$.get()).toEqual([2]);
			expect(copy$.get()).not.toBe(first);
		});
	}

	it('compares with Object.is alone by default', () => {
		const scope = owner();
		const point$ = scope.signal$('point', { x: 0, y: 0 });
		const notified: number[] = [];
		point$.subscribe(() => notified.push(point$.get().x));
		point$.set({ x: 0, y: 0 });
		expect(notified).toEqual([0]);
	});

	it('rejects an equals option that is not a function', () => {
		const scope = owner();
		expect(() => scope.signal$('a', 1, { equals: 'no' as never })).toThrow(TypeError);
		expect(() => scope.derived$(null, () => 1, { equals: 1 as never })).toThrow(TypeError);
		expect(() => scope.signal$(null, 1, 'no' as never)).toThrow(TypeError);
	});
});
