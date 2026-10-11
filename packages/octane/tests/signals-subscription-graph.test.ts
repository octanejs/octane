import { afterEach, expect, it } from 'vitest';
import { createScope, type Scope } from 'octane/signals';

// Independently authored Octane subscription contracts for graph scenarios in
// https://github.com/johnsoncodehk/reactive-framework-test-suite/tree/d51175a574a81a59864e82a76d717eeb0a10987f
// Alien's eager effects and nested cleanup ownership are not emulated here.
const scopes: Scope[] = [];
function owner() {
	const scope = createScope({ scopeKey: `subscription-${scopes.length}` });
	scopes.push(scope);
	return scope;
}
afterEach(() => {
	for (const scope of scopes.splice(0)) scope.dispose();
});

it('keeps sibling projections live when another projection leaves and rejoins a source', () => {
	const scope = owner();
	const enabled$ = scope.signal$('enabled', true);
	const source$ = scope.signal$('source', 2);
	const selected$ = scope.derived$('selected', () => (enabled$.get() ? source$.get() * 3 : -1));
	const sibling$ = scope.derived$('sibling', () => source$.get() + 10);
	const selections: number[] = [];
	const siblings: number[] = [];
	selected$.subscribe(() => selections.push(selected$.get()));
	sibling$.subscribe(() => siblings.push(sibling$.get()));
	expect([selected$.get(), sibling$.get()]).toEqual([6, 12]);
	enabled$.set(false);
	source$.set(4);
	expect([selected$.get(), sibling$.get()]).toEqual([-1, 14]);
	enabled$.set(true);
	source$.set(5);
	expect(selections).toEqual([-1, 12, 15]);
	expect(siblings).toEqual([14, 15]);
});

it('removes queued subscriptions inside a batch without dropping surviving delivery', () => {
	const scope = owner();
	const source$ = scope.signal$('source', 1);
	const view$ = scope.derived$('view', () => source$.get() * 4);
	const removed: number[] = [];
	const kept: number[] = [];
	const stop = view$.subscribe(() => removed.push(view$.get()));
	view$.subscribe(() => kept.push(view$.get()));
	scope.batch(() => {
		source$.set(2);
		stop();
		stop();
		source$.set(3);
	});
	source$.set(4);
	expect(removed).toEqual([]);
	expect(kept).toEqual([12, 16]);
	const replacement: number[] = [];
	view$.subscribe(() => replacement.push(view$.get()));
	expect(view$.get()).toBe(16);
	source$.set(5);
	expect(replacement).toEqual([20]);
	expect(kept).toEqual([12, 16, 20]);
});

it('can stop during its own callback and continue reading without resubscribing', () => {
	const scope = owner();
	const first$ = scope.signal$('first', 0);
	const second$ = scope.signal$('second', 10);
	const pair$ = scope.derived$('pair', () => `${first$.get()}:${second$.get()}`);
	const seen: string[] = [];
	const stop = pair$.subscribe(() => {
		stop();
		seen.push(pair$.get());
	});
	first$.set(1);
	second$.set(20);
	first$.set(2);
	expect(seen).toEqual(['1:10']);
	expect(pair$.get()).toBe('2:20');
});

it.each([false, true])(
	'stopping during a dependency read preserves its sibling (unchanged=%s)',
	(unchanged) => {
		const scope = owner();
		const source$ = scope.signal$('source', 0);
		let stop = () => {};
		const view$ = scope.derived$('view', () => {
			const value = source$.get();
			if (value === 1) stop();
			return unchanged ? 0 : value;
		});
		const removed: number[] = [];
		const kept: number[] = [];
		stop = view$.subscribe(() => removed.push(view$.get()));
		view$.subscribe(() => kept.push(view$.get()));
		source$.set(1);
		source$.set(2);
		expect(removed).toEqual([]);
		expect(kept).toEqual(unchanged ? [] : [1, 2]);
		expect(view$.get()).toBe(unchanged ? 0 : 2);
	},
);

it('a stable branch does not hide a changed branch at a subscribed join', () => {
	const scope = owner();
	const source$ = scope.signal$('source', 1);
	const parity$ = scope.derived$('parity', () => source$.get() % 2);
	const scaled$ = scope.derived$('scaled', () => source$.get() * 10);
	const join$ = scope.derived$('join', () => `${parity$.get()}:${scaled$.get()}`);
	const seen: string[] = [];
	join$.subscribe(() => seen.push(join$.get()));
	scope.batch(() => {
		source$.set(2);
		source$.set(3);
	});
	source$.set(5);
	expect(seen).toEqual(['1:30', '1:50']);
	expect(join$.get()).toBe('1:50');
});

it('reorders repeated dependency reads without losing either live source', () => {
	const scope = owner();
	const reverse$ = scope.signal$('reverse', false);
	const left$ = scope.signal$('left', 'L');
	const right$ = scope.signal$('right', 'R');
	const pair$ = scope.derived$('pair', () =>
		reverse$.get()
			? `${right$.get()}${left$.get()}${right$.get()}`
			: `${left$.get()}${right$.get()}${left$.get()}`,
	);
	const seen: string[] = [];
	pair$.subscribe(() => seen.push(pair$.get()));
	reverse$.set(true);
	left$.set('A');
	right$.set('B');
	reverse$.set(false);
	left$.set('C');
	expect(seen).toEqual(['RLR', 'RAR', 'BAB', 'ABA', 'CBC']);
});

it('a stopped last subscriber does not retire a scope-owned producer', () => {
	const scope = owner();
	const source$ = scope.signal$('source', 1);
	const view$ = scope.derived$('view', () => source$.get() + 1);
	const old: number[] = [];
	const stop = view$.subscribe(() => old.push(view$.get()));
	stop();
	source$.set(5);
	expect(view$.get()).toBe(6);
	const next: number[] = [];
	view$.subscribe(() => next.push(view$.get()));
	source$.set(6);
	expect(old).toEqual([]);
	expect(next).toEqual([7]);
});
