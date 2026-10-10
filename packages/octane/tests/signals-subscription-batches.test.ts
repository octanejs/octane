import { afterEach, expect, it } from 'vitest';
import { createScope, ScopeDisposedError, type Scope } from 'octane/signals';

const owners: Scope[] = [];
function owner() {
	const scope = createScope({ scopeKey: `subscription-batch-${owners.length}` });
	owners.push(scope);
	return scope;
}
afterEach(() => {
	for (const scope of owners.splice(0)) scope.dispose();
});

it('keeps sibling delivery deferred when a nested batch explicitly reads a derived chain', () => {
	const scope = owner();
	const a$ = scope.signal$('a', 1);
	const b$ = scope.signal$('b', 10);
	const sum$ = scope.derived$('sum', () => a$.get() + b$.get());
	const twice$ = scope.derived$('twice', () => sum$.get() * 2);
	const sums: number[] = [];
	const doubled: number[] = [];
	sum$.subscribe(() => sums.push(sum$.get()));
	twice$.subscribe(() => doubled.push(twice$.get()));
	scope.batch(() => {
		a$.set(2);
		scope.batch(() => b$.set(20));
		expect([sum$.get(), twice$.get()]).toEqual([22, 44]);
		expect(sums).toEqual([]);
		expect(doubled).toEqual([]);
	});
	expect(sums).toEqual([22]);
	expect(doubled).toEqual([44]);
	scope.batch(() => scope.batch(() => a$.set(2)));
	expect(sums).toEqual([22]);
	a$.set(3);
	expect(sums).toEqual([22, 23]);
	expect(doubled).toEqual([44, 46]);
});

it('does not publish an unchanged derived chain after a batched source reversion', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 2);
	const parity$ = scope.derived$('parity', () => input$.get() % 2);
	const label$ = scope.derived$('label', () => (parity$.get() === 0 ? 'even' : 'odd'));
	const seen: string[] = [];
	label$.subscribe(() => seen.push(label$.get()));
	scope.batch(() => {
		input$.set(3);
		input$.set(2);
	});
	expect(label$.get()).toBe('even');
	expect(seen).toEqual([]);
	input$.set(4);
	expect(seen).toEqual([]);
	input$.set(5);
	expect(seen).toEqual(['odd']);
});

it('a subscriber added during a batch reads current state and receives the final later write', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 1);
	const view$ = scope.derived$('view', () => input$.get() * 3);
	const seen: number[] = [];
	scope.batch(() => {
		input$.set(2);
		expect(view$.get()).toBe(6);
		view$.subscribe(() => seen.push(view$.get()));
		expect(seen).toEqual([]);
		input$.set(3);
		expect(view$.get()).toBe(9);
		expect(seen).toEqual([]);
	});
	expect(seen).toEqual([9]);
	input$.set(4);
	expect(seen).toEqual([9, 12]);
});

it('all subscribed branches of a cross-diamond observe the accepted batched inputs', () => {
	const scope = owner();
	const a$ = scope.signal$('a', 2);
	const b$ = scope.signal$('b', 3);
	const sum$ = scope.derived$('sum', () => a$.get() + b$.get());
	const product$ = scope.derived$('product', () => a$.get() * b$.get());
	const joined$ = scope.derived$('joined', () => `${sum$.get()}:${product$.get()}`);
	const sums: number[] = [];
	const products: number[] = [];
	const joins: string[] = [];
	sum$.subscribe(() => sums.push(sum$.get()));
	product$.subscribe(() => products.push(product$.get()));
	joined$.subscribe(() => joins.push(joined$.get()));
	scope.batch(() => {
		a$.set(4);
		b$.set(5);
	});
	expect(sums).toEqual([9]);
	expect(products).toEqual([20]);
	expect(joins).toEqual(['9:20']);
	b$.set(6);
	expect(sums).toEqual([9, 10]);
	expect(products).toEqual([20, 24]);
	expect(joins).toEqual(['9:20', '10:24']);
});

it('an unrelated write does not replay subscribers after another callback throws', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 0);
	const unrelated$ = scope.signal$('unrelated', 0);
	const projected$ = scope.derived$('projected', () => input$.get() * 2);
	const error = new Error('subscription failed');
	const stop = input$.subscribe(() => {
		throw error;
	});
	const accepted: number[] = [];
	projected$.subscribe(() => accepted.push(projected$.get()));
	expect(() => input$.set(1)).toThrow(error);
	expect(accepted).toEqual([2]);
	unrelated$.set(1);
	expect(accepted).toEqual([2]);
	stop();
	input$.set(2);
	expect(accepted).toEqual([2, 4]);
});

it('a watched error chain recovers while an independent subscriber remains live', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 1);
	const error = new Error('projection unavailable');
	const value$ = scope.derived$('value', () => {
		if (input$.get() === 0) throw error;
		return input$.get() * 2;
	});
	const label$ = scope.derived$('label', () => `value:${value$.get()}`);
	const accepted: string[] = [];
	const failures: unknown[] = [];
	label$.subscribe(() => {
		const state = label$.snapshot();
		if (state.status === 'ready') accepted.push(state.value);
		else if (state.status === 'error') failures.push(state.error);
	});
	const source: number[] = [];
	input$.subscribe(() => source.push(input$.get()));
	input$.set(0);
	expect(() => label$.get()).toThrow(error);
	expect(failures).toEqual([error]);
	input$.set(3);
	expect(label$.get()).toBe('value:6');
	expect(accepted).toEqual(['value:6']);
	expect(source).toEqual([0, 3]);
});

it('a callback write refreshes a derived sibling and remains live for later independent writes', () => {
	const scope = owner();
	const trigger$ = scope.signal$('trigger', 0);
	const sibling$ = scope.signal$('sibling', 0);
	const doubled$ = scope.derived$('doubled', () => sibling$.get() * 2);
	const joined$ = scope.derived$('joined', () => trigger$.get() + doubled$.get());
	trigger$.subscribe(() => {
		if (trigger$.get() === 1) sibling$.set(2);
	});
	const values: number[] = [];
	joined$.subscribe(() => values.push(joined$.get()));
	trigger$.set(1);
	expect(joined$.get()).toBe(5);
	expect(values.at(-1)).toBe(5);
	sibling$.set(3);
	expect(joined$.get()).toBe(7);
	expect(values.at(-1)).toBe(7);
});

it('replacing an explicit child owner preserves the shared producer and retires the old child', () => {
	const data = owner();
	const selector$ = data.signal$('selector', 1);
	const shared$ = data.signal$('shared', 5);
	let child = owner();
	let selected$ = child.derived$('selected', () => shared$.get());
	const original$ = selected$;
	const retired: Scope[] = [];
	selector$.subscribe(() => {
		retired.push(child);
		child.dispose();
		child = owner();
		const factor = selector$.get();
		selected$ = child.derived$('selected', () => shared$.get() * factor);
	});
	expect(original$.get()).toBe(5);
	selector$.set(2);
	expect(retired.every((scope) => scope.retired)).toBe(true);
	expect(() => original$.get()).toThrow(ScopeDisposedError);
	expect(selected$.get()).toBe(10);
	shared$.set(6);
	expect(selected$.get()).toBe(12);
	selector$.set(3);
	expect(selected$.get()).toBe(18);
});
