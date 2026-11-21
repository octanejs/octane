import { describe, expect, it } from 'vitest';
import { createScope, derived$, runWithSignalOwner, type WritableSignal } from 'octane/signals';

describe('watched derived stabilization', () => {
	it('keeps a shared source running when a watched cleanup attaches a new reader', () => {
		const scope = createScope({ scopeKey: 'cleanup-handoff' });
		const events: string[] = [];
		const source$ = scope.signal$(null, 1, {
			watched() {
				events.push('start');
				return () => events.push('stop');
			},
		});
		const shared$ = scope.derived$(null, () => source$.get() * 2);
		const values: number[] = [];
		let release!: () => void;
		const outgoing$ = scope.derived$(null, () => shared$.get(), {
			watched: () => () => {
				release = shared$.subscribe(() => values.push(shared$.get()));
			},
		});

		const stop = outgoing$.subscribe(() => {});
		stop();
		source$.set(2);
		expect(values).toEqual([4]);
		expect(events).toEqual(['start']);
		release();
		expect(events).toEqual(['start', 'stop']);
		scope.dispose();
	});

	it.each([null, 'selected'] as const)('compares only the stabilized value (%s)', (key) => {
		const scope = createScope({ scopeKey: 'stable-comparison' });
		const enabled$ = scope.signal$(null, false);
		const value$ = scope.signal$(null, 0);
		const watched$ = scope.signal$(null, 0, { watched: () => value$.set(2) });
		const comparisons: Array<readonly [{ v: number }, { v: number }]> = [];
		const selected$ = scope.derived$(
			key,
			() => {
				const v = value$.get();
				if (enabled$.get()) watched$.get();
				return { v };
			},
			{
				equals(previous, next) {
					comparisons.push([previous, next]);
					if (next.v === 0) throw new Error('intermediate comparison');
					return previous.v === next.v;
				},
			},
		);
		const committed = selected$.get();
		const stop = selected$.subscribe(() => {});
		enabled$.set(true);
		expect(selected$.get()).toEqual({ v: 2 });
		expect(comparisons).toHaveLength(1);
		expect(comparisons[0]?.[0]).toBe(committed);
		expect(comparisons[0]?.[1]).toEqual({ v: 2 });
		stop();
		scope.dispose();
	});

	it.each([null, 'selected'] as const)(
		'finishes equality after a net-equal dependency (%s)',
		(key) => {
			const scope = createScope({ scopeKey: 'pending-net-equal' });
			const raw$ = scope.signal$(null, 0);
			const parity$ = scope.derived$(null, () => raw$.get() % 2);
			const enabled$ = scope.signal$(null, false);
			const watched$ = scope.signal$(null, 0, { watched: () => raw$.set(2) });
			let comparisons = 0;
			const selected$ = scope.derived$(
				key,
				() => {
					const v = parity$.get();
					if (enabled$.get()) watched$.get();
					return { v };
				},
				{
					equals(previous, next) {
						comparisons++;
						return previous.v === next.v;
					},
				},
			);
			const committed = selected$.get();
			let notices = 0;
			const stop = selected$.subscribe(() => notices++);
			enabled$.set(true);
			expect(selected$.get()).toBe(committed);
			expect(comparisons).toBe(1);
			expect(notices).toBe(0);
			stop();
			scope.dispose();
		},
	);

	it.each([null, 'selected'] as const)(
		'keeps setup invalidation through watched cleanup (%s)',
		(key) => {
			const scope = createScope({ scopeKey: 'setup-and-cleanup' });
			const enabled$ = scope.signal$(null, false);
			const value$ = scope.signal$(null, 0);
			const cleanup$ = scope.signal$(null, 0);
			const old$ = scope.signal$(null, 0, { watched: () => () => cleanup$.set(1) });
			const fresh$ = scope.signal$(null, 0, { watched: () => value$.set(2) });
			const comparisons: Array<readonly [{ v: number }, { v: number }]> = [];
			const selected$ = scope.derived$(
				key,
				() => {
					const v = value$.get();
					cleanup$.get();
					(enabled$.get() ? fresh$ : old$).get();
					return { v };
				},
				{
					equals(previous, next) {
						comparisons.push([previous, next]);
						return previous.v === next.v;
					},
				},
			);
			const committed = selected$.get();
			let notices = 0;
			const stop = selected$.subscribe(() => notices++);
			enabled$.set(true);
			expect(selected$.get()).toEqual({ v: 2 });
			expect(notices).toBe(1);
			expect(comparisons).toHaveLength(1);
			expect(comparisons[0]?.[0]).toBe(committed);
			stop();
			scope.dispose();
		},
	);

	it.each([null, 'selected'] as const)(
		'compares after watched cleanup has finished (%s)',
		(key) => {
			const scope = createScope({ scopeKey: 'cleanup-comparison' });
			const enabled$ = scope.signal$(null, false);
			const value$ = scope.signal$(null, 0);
			const old$ = scope.signal$(null, 0, { watched: () => () => value$.set(2) });
			const comparisons: Array<readonly [number, number]> = [];
			const selected$ = scope.derived$(
				key,
				() => {
					const v = value$.get();
					if (!enabled$.get()) old$.get();
					return { v };
				},
				{
					equals(previous, next) {
						comparisons.push([previous.v, next.v]);
						if (next.v === 0) throw new Error('provisional comparison');
						return previous.v === next.v;
					},
				},
			);
			selected$.get();
			const stop = selected$.subscribe(() => {});
			enabled$.set(true);
			expect(selected$.get()).toEqual({ v: 2 });
			expect(comparisons).toEqual([[0, 2]]);
			stop();
			scope.dispose();
		},
	);

	it('stabilizes configured authored derived equality through watched cleanup', () => {
		const scope = createScope({ scopeKey: 'authored-cleanup' });
		const enabled$ = scope.signal$(null, false);
		const value$ = scope.signal$(null, 0);
		const old$ = scope.signal$(null, 0, { watched: () => () => value$.set(2) });
		const comparisons: Array<readonly [number, number]> = [];
		const selected$ = derived$(
			() => {
				const v = value$.get();
				if (!enabled$.get()) old$.get();
				return { v };
			},
			{
				key: 'selected',
				sync: true,
				equals(previous, next) {
					comparisons.push([previous.v, next.v]);
					return previous.v === next.v;
				},
			},
		);
		runWithSignalOwner(scope, () => {
			selected$.get();
			const stop = selected$.subscribe(() => {});
			enabled$.set(true);
			expect(selected$.get()).toEqual({ v: 2 });
			expect(comparisons).toEqual([[0, 2]]);
			stop();
		});
		scope.dispose();
	});

	it.each([null, 'parent'] as const)('filters a net-equal watched change (%s)', (key) => {
		const scope = createScope({ scopeKey: 'net-equal-watch' });
		const value$ = scope.signal$(null, 0);
		const enabled$ = scope.signal$(null, false);
		const source$ = scope.signal$(null, 0, { watched: () => value$.set(0) });
		const parent$ = scope.derived$(key, () => {
			const value = value$.get();
			if (enabled$.get()) source$.get();
			return value;
		});
		let childReads = 0;
		const child$ = scope.derived$(null, () => {
			childReads++;
			return parent$.get();
		});
		let notices = 0;
		const stop = child$.subscribe(() => notices++);
		scope.batch(() => {
			value$.set(1);
			enabled$.set(true);
		});
		expect(child$.get()).toBe(0);
		expect(childReads).toBe(1);
		expect(notices).toBe(0);
		stop();
		scope.dispose();
	});

	it.each([null, 'selected'] as const)('compares recovery with the ready value (%s)', (key) => {
		const scope = createScope({ scopeKey: 'failed-watch-equality' });
		const enabled$ = scope.signal$(null, false);
		const ready$ = scope.signal$(null, false);
		const watched$ = scope.signal$(null, 0, { watched: () => ready$.set(true) });
		const compared: unknown[] = [];
		const selected$ = scope.derived$(
			key,
			() => {
				const ready = ready$.get();
				if (!enabled$.get()) return 1;
				watched$.get();
				if (!ready) throw new Error('not ready');
				return 2;
			},
			{
				equals: (previous, next) => {
					compared.push(previous);
					return previous === next;
				},
			},
		);
		const stop = selected$.subscribe(() => {});
		enabled$.set(true);
		expect(selected$.get()).toBe(2);
		expect(compared).toEqual([1]);
		stop();
		scope.dispose();
	});

	it.each([null, 'selected'] as const)('retains ready equality across failures (%s)', (key) => {
		const scope = createScope({ scopeKey: 'recovered-selector-equality' });
		const enabled$ = scope.signal$(null, false);
		const phase$ = scope.signal$(null, 0);
		const first$ = scope.signal$(null, 0, { watched: () => phase$.set(1) });
		const second$ = scope.signal$(null, 0, { watched: () => phase$.set(2) });
		const comparisons: Array<readonly [{ x: number }, { x: number }]> = [];
		const selected$ = scope.derived$(
			key,
			() => {
				if (!enabled$.get()) return { x: 1 };
				const phase = phase$.get();
				if (phase < 2) {
					(phase === 0 ? first$ : second$).get();
					throw new Error('not ready');
				}
				return { x: 1 };
			},
			{
				equals: (previous, next) => {
					comparisons.push([previous, next]);
					return previous.x === next.x;
				},
			},
		);
		const committed = selected$.get();
		let notices = 0;
		const stop = selected$.subscribe(() => notices++);
		enabled$.set(true);
		expect(selected$.get()).toBe(committed);
		expect(comparisons).toHaveLength(1);
		expect(comparisons[0]?.[0]).toBe(committed);
		expect(comparisons[0]?.[1]).not.toBe(committed);
		expect(notices).toBe(0);
		stop();
		scope.dispose();
	});

	it('refreshes a transitive subscriber when a stabilized keyed dependency changes', () => {
		const scope = createScope({ scopeKey: 'keyed-transitive-watch' });
		const enabled$ = scope.signal$(null, false);
		const value$ = scope.signal$(null, 0);
		const watched$ = scope.signal$(null, 0, { watched: () => value$.set(1) });
		const parent$ = scope.derived$('parent', () => {
			const value = value$.get();
			if (enabled$.get()) watched$.get();
			return value;
		});
		const child$ = scope.derived$('child', () => parent$.get() * 2);
		const seen: number[] = [];
		const stop = child$.subscribe(() => seen.push(child$.get()));
		enabled$.set(true);
		expect(child$.get()).toBe(2);
		expect(seen).toEqual([2]);
		stop();
		scope.dispose();
	});

	it('releases dynamically rewired dependencies after watched setup', () => {
		const scope = createScope({ scopeKey: 'rewired-watch' });
		const events: string[] = [];
		let selected$: WritableSignal<boolean>;
		selected$ = scope.signal$(null, false, {
			watched: () => {
				selected$.set(true);
				return () => {
					selected$.set(false);
				};
			},
		});
		const one$ = scope.signal$(null, 1, {
			watched: () => {
				events.push('one:start');
				return () => events.push('one:stop');
			},
		});
		const two$ = scope.signal$(null, 2, {
			watched: () => {
				events.push('two:start');
				return () => events.push('two:stop');
			},
		});
		const result$ = scope.derived$(null, () => (selected$.get() ? one$.get() : two$.get()));
		expect(result$.get()).toBe(2);
		const stop = result$.subscribe(() => {});
		expect(result$.get()).toBe(1);
		stop();
		expect(events.filter((event) => event.endsWith(':start')).length).toBe(
			events.filter((event) => event.endsWith(':stop')).length,
		);
		expect(events).toContain('one:stop');
		scope.dispose();
	});

	it('returns a recovered value when linking a failed derived starts its watched source', () => {
		const scope = createScope({ scopeKey: 'recovered-watch' });
		let source$: WritableSignal<number>;
		source$ = scope.signal$(null, 0, { watched: () => source$.set(1) });
		let comparisons = 0;
		const value$ = scope.derived$(
			null,
			() => {
				const current = source$.get();
				if (current === 0) throw new Error('not ready');
				return current;
			},
			{
				equals: (previous, next) => {
					comparisons++;
					return previous === next;
				},
			},
		);
		const seen: number[] = [];
		const stop = scope.effect(() => {
			seen.push(value$.get());
		});
		expect(seen).toEqual([1]);
		expect(comparisons).toBe(0);
		stop();
		scope.dispose();
	});

	it('recomputes when watched setup changes an earlier dependency', () => {
		const scope = createScope({ scopeKey: 'stabilize-watch' });
		const enabled$ = scope.signal$(null, false);
		const earlier$ = scope.signal$(null, 0);
		const watched$ = scope.signal$(null, 0, { watched: () => earlier$.set(1) });
		const value$ = scope.derived$(null, () => {
			const first = earlier$.get();
			return enabled$.get() ? first + watched$.get() : first;
		});
		const seen: number[] = [];
		const stop = scope.effect(() => {
			seen.push(value$.get());
		});
		enabled$.set(true);
		expect(seen).toEqual([0, 1]);
		stop();
		scope.dispose();
	});
	it('notifies a pending subscriber when a later equal dependency starts a watched source', () => {
		const scope = createScope({ scopeKey: 'pending-subscriber-watch' });
		const enabled$ = scope.signal$(null, false);
		const earlier$ = scope.signal$(null, 0);
		const watched$ = scope.signal$(null, 0, { watched: () => earlier$.set(1) });
		const inner$ = scope.derived$(null, () => (enabled$.get() ? watched$.get() : 0));
		const outer$ = scope.derived$(null, () => earlier$.get() + inner$.get());
		const seen: number[] = [];
		const stop = outer$.subscribe(() => seen.push(outer$.get()));
		enabled$.set(true);
		expect(seen).toEqual([1]);
		stop();
		scope.dispose();
	});
});
