import { afterEach, expect, it } from 'vitest';
import { createScope, ScopeDisposedError, type Scope } from 'octane/signals';

const owners: Scope[] = [];
function owner() {
	const scope = createScope({ scopeKey: `feedback-${owners.length}` });
	owners.push(scope);
	return scope;
}
afterEach(() => {
	for (const scope of owners.splice(0)) scope.dispose();
});

it('flushes accepted writes after a batch body throws and keeps later notifications live', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 0);
	const doubled$ = scope.derived$('doubled', () => input$.get() * 2);
	const seen: number[] = [];
	doubled$.subscribe(() => seen.push(doubled$.get()));
	const failure = new Error('body stopped');
	expect(() =>
		scope.batch(() => {
			input$.set(1);
			input$.set(2);
			input$.set(3);
			throw failure;
		}),
	).toThrow(failure);
	expect(seen).toEqual([6]);
	input$.set(4);
	expect(seen).toEqual([6, 8]);
});

it('finishes surviving queued callbacks when another subscriber throws during batch flush', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 0);
	const view$ = scope.derived$('view', () => input$.get() + 10);
	const failure = new Error('queued callback stopped');
	const stop = input$.subscribe(() => {
		throw failure;
	});
	const seen: number[] = [];
	view$.subscribe(() => seen.push(view$.get()));
	expect(() =>
		scope.batch(() => {
			input$.set(1);
			input$.set(2);
		}),
	).toThrow(failure);
	expect(seen).toEqual([12]);
	stop();
	input$.set(3);
	expect(seen).toEqual([12, 13]);
});

it.each([0, 9])('feedback to %s leaves the second subscriber at the final value', (replacement) => {
	const scope = owner();
	const input$ = scope.signal$('input', 0);
	const projected$ = scope.derived$('projected', () => input$.get());
	projected$.subscribe(() => {
		if (projected$.get() === 1) input$.set(replacement);
	});
	const seen = [projected$.get()];
	projected$.subscribe(() => seen.push(projected$.get()));
	input$.set(1);
	expect(input$.get()).toBe(replacement);
	expect(projected$.get()).toBe(replacement);
	expect(seen.at(-1)).toBe(replacement);
	input$.set(2);
	expect(seen.at(-1)).toBe(2);
});

it('a feedback chain resets repeatedly without leaving a stale computed value', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 0);
	const first$ = scope.derived$('first', () => input$.get());
	const active$ = scope.derived$('active', () => first$.get() > 0);
	const seen: boolean[] = [];
	active$.subscribe(() => {
		seen.push(active$.get());
		if (active$.get()) {
			input$.set(0);
			expect(input$.get()).toBe(0);
		}
	});
	for (const value of [1, 2, 3]) {
		input$.set(value);
		expect(input$.get()).toBe(0);
		expect(first$.get()).toBe(0);
		expect(active$.get()).toBe(false);
		expect(seen.at(-1)).toBe(false);
	}
});

it('a join sees both sibling callback writes and remains responsive afterward', () => {
	const scope = owner();
	const trigger$ = scope.signal$('trigger', 0);
	const left$ = scope.signal$('left', 0);
	const right$ = scope.signal$('right', 0);
	const sum$ = scope.derived$('sum', () => left$.get() + right$.get());
	trigger$.subscribe(() => {
		if (trigger$.get() === 1) left$.set(7);
	});
	trigger$.subscribe(() => {
		if (trigger$.get() === 1) right$.set(11);
	});
	const seen = [sum$.get()];
	sum$.subscribe(() => seen.push(sum$.get()));
	trigger$.set(1);
	expect(sum$.get()).toBe(18);
	expect(seen.at(-1)).toBe(18);
	left$.set(9);
	expect(seen.at(-1)).toBe(20);
});

it('two conditional consumers can publish outputs without sharing dependency tracking', () => {
	const scope = owner();
	const choice$ = scope.signal$('choice', false);
	const left$ = scope.signal$('left', 2);
	const right$ = scope.signal$('right', 5);
	const firstOutput$ = scope.signal$('first-output', 0);
	const secondOutput$ = scope.signal$('second-output', 0);
	const first$ = scope.derived$('first', () => (choice$.get() ? right$.get() : left$.get()));
	const second$ = scope.derived$(
		'second',
		() => (choice$.get() ? left$.get() + right$.get() : right$.get()) + firstOutput$.get(),
	);
	firstOutput$.set(first$.get());
	secondOutput$.set(second$.get());
	const firstValues: number[] = [];
	first$.subscribe(() => {
		firstValues.push(first$.get());
		firstOutput$.set(first$.get());
	});
	second$.subscribe(() => secondOutput$.set(second$.get()));
	expect([firstOutput$.get(), secondOutput$.get()]).toEqual([2, 7]);
	right$.set(6);
	expect(firstValues).toEqual([]);
	expect([firstOutput$.get(), secondOutput$.get()]).toEqual([2, 8]);
	choice$.set(true);
	expect([firstOutput$.get(), secondOutput$.get()]).toEqual([6, 14]);
	left$.set(3);
	expect([firstOutput$.get(), secondOutput$.get()]).toEqual([6, 15]);
});

it('a subscribed loaded chain returns to its original branch after equal intermediate results', () => {
	const scope = owner();
	const items$ = scope.signal$<number[] | undefined>('items', undefined);
	const loaded$ = scope.derived$('loaded', () => items$.get() !== undefined);
	const label$ = scope.derived$('label', () => (loaded$.get() ? 'loaded' : 'waiting'));
	const seen = [label$.get()];
	label$.subscribe(() => seen.push(label$.get()));
	items$.set([1]);
	items$.set([2, 3]);
	items$.set(undefined);
	expect(seen).toEqual(['waiting', 'loaded', 'waiting']);
});

it('disposal during a join refresh remains safe beside an unchanged computed branch', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 0);
	let stop = () => {};
	const steady$ = scope.derived$('steady', () => {
		input$.get();
		return 0;
	});
	const disposing$ = scope.derived$('disposing', () => {
		const value = input$.get();
		if (value > 0) stop();
		return value;
	});
	const joined$ = scope.derived$('joined', () => `${steady$.get()}:${disposing$.get()}`);
	const removed: string[] = [];
	stop = joined$.subscribe(() => removed.push(joined$.get()));
	const survivor: number[] = [];
	input$.subscribe(() => survivor.push(input$.get()));
	input$.set(1);
	input$.set(2);
	expect(removed).toEqual([]);
	expect(survivor).toEqual([1, 2]);
	expect(joined$.get()).toBe('0:2');
});

it('the same source can replace a child scope and feed its freshly created derived value', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 1);
	let child = owner();
	let current$ = child.derived$('current', () => input$.get() * 2);
	const old$ = current$;
	input$.subscribe(() => {
		child.dispose();
		child = owner();
		current$ = child.derived$('current', () => input$.get() * 2);
	});
	expect(current$.get()).toBe(2);
	input$.set(2);
	expect(current$.get()).toBe(4);
	expect(() => old$.get()).toThrow(ScopeDisposedError);
	input$.set(3);
	expect(current$.get()).toBe(6);
});

it('a child subscribed during a parent callback tracks independently and prunes unchanged results', () => {
	const scope = owner();
	const parent$ = scope.signal$('parent', 0);
	const childInput$ = scope.signal$('child-input', 0);
	const parentValues: number[] = [];
	const childValues: number[] = [];
	let child: Scope | undefined;
	parent$.subscribe(() => {
		parentValues.push(parent$.get());
		child?.dispose();
		child = owner();
		const parity$ = child.derived$('parity', () => childInput$.get() % 2);
		parity$.subscribe(() => childValues.push(parity$.get()));
		childInput$.set(1);
	});
	try {
		parent$.set(1);
		expect(parentValues).toEqual([1]);
		expect(childValues).toEqual([1]);
		childInput$.set(3);
		expect(parentValues).toEqual([1]);
		expect(childValues).toEqual([1]);
		childInput$.set(4);
		expect(parentValues).toEqual([1]);
		expect(childValues).toEqual([1, 0]);
		parent$.set(2);
		expect(parentValues).toEqual([1, 2]);
		expect(childValues.at(-1)).toBe(1);
	} finally {
		child?.dispose();
	}
});

it('a wide subscribed fan-out delivers each branch and preserves the shared join', () => {
	const scope = owner();
	const input$ = scope.signal$('input', 0);
	const branches$ = Array.from({ length: 48 }, (_, index) =>
		scope.derived$(`branch-${index}`, () => input$.get() + index),
	);
	const seen: number[][] = branches$.map(() => []);
	for (const [index, branch$] of branches$.entries())
		branch$.subscribe(() => seen[index].push(branch$.get()));
	const sum$ = scope.derived$('sum', () =>
		branches$.reduce((total, branch$) => total + branch$.get(), 0),
	);
	const sums: number[] = [];
	sum$.subscribe(() => sums.push(sum$.get()));
	input$.set(1);
	expect(seen).toEqual(Array.from({ length: 48 }, (_, index) => [index + 1]));
	expect(sums).toEqual([1176]);
	input$.set(2);
	expect(seen).toEqual(Array.from({ length: 48 }, (_, index) => [index + 1, index + 2]));
	expect(sums).toEqual([1176, 1224]);
});

it('a conditional subscriber can fill its own empty target and respond after another reset', () => {
	const scope = owner();
	const trigger$ = scope.signal$('trigger', 0);
	const target$ = scope.signal$('target', 0);
	const intent$ = scope.derived$('intent', () =>
		trigger$.get() > 0 && target$.get() === 0 ? trigger$.get() : null,
	);
	let callbacks = 0;
	intent$.subscribe(() => {
		if (++callbacks >= 32) throw new Error('authored feedback safety bound');
		const next = intent$.get();
		if (next !== null) target$.set(next);
	});
	trigger$.set(5);
	expect(target$.get()).toBe(5);
	trigger$.set(9);
	expect(target$.get()).toBe(5);
	target$.set(0);
	expect(target$.get()).toBe(9);
});

it('a subscribed counter converges through accepted updates and can converge again', () => {
	const scope = owner();
	const counter$ = scope.signal$('counter', 0);
	const values: number[] = [];
	counter$.subscribe(() => {
		if (values.length >= 32) throw new Error('authored feedback safety bound');
		const value = counter$.get();
		values.push(value);
		if (value < 5) counter$.set(value + 1);
	});
	counter$.set(1);
	expect(values).toEqual([1, 2, 3, 4, 5]);
	expect(counter$.get()).toBe(5);
	values.length = 0;
	counter$.set(0);
	expect(values).toEqual([0, 1, 2, 3, 4, 5]);
	expect(counter$.get()).toBe(5);
});
