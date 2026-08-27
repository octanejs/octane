import { afterEach, describe, expect, it } from 'vitest';
import {
	createScope,
	ScopeDisposedError,
	SignalCycleError,
	SignalWriteError,
	type Scope,
} from 'octane/signals';

const owners: Scope[] = [];
function owner(key = `state-${owners.length}`): Scope {
	const scope = createScope({ scopeKey: key });
	owners.push(scope);
	return scope;
}

afterEach(() => {
	for (const scope of owners.splice(0)) scope.dispose();
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

	it('uses Object.is equality for NaN and signed zero', () => {
		const scope = owner();
		const value$ = scope.signal$('value', Number.NaN);
		const values: number[] = [];
		value$.subscribe(() => values.push(value$.get()));
		value$.set(Number.NaN);
		expect(values).toEqual([]);
		value$.set(0);
		value$.set(-0);
		expect(values).toHaveLength(2);
		expect(Object.is(values[0], 0)).toBe(true);
		expect(Object.is(values[1], -0)).toBe(true);
	});

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

	it('rejects duplicate and empty keys instead of merging unrelated nodes', () => {
		expect(() => createScope({ scopeKey: '' })).toThrow(/nonempty/);
		const scope = owner();
		scope.signal$('same', 1);
		expect(() => scope.derived$('same', () => 2)).toThrow(/already exists/);
		expect(() => scope.signal$('', 1)).toThrow(/nonempty/);
	});
});
