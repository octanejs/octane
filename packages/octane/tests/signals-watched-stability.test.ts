import { describe, expect, it } from 'vitest';
import { createScope, type WritableSignal } from 'octane/signals';

describe('watched keyless stabilization', () => {
	it('does not recompute a child when watched stabilization restores the prior value', () => {
		const scope = createScope({ scopeKey: 'net-equal-watch' });
		const value$ = scope.signal$(null, 0);
		const enabled$ = scope.signal$(null, false);
		const source$ = scope.signal$(null, 0, { watched: () => value$.set(0) });
		const parent$ = scope.derived$(null, () => {
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

	it('does not compare a failed stabilization round with its recovered value', () => {
		const scope = createScope({ scopeKey: 'failed-watch-equality' });
		const enabled$ = scope.signal$(null, false);
		const ready$ = scope.signal$(null, false);
		const watched$ = scope.signal$(null, 0, { watched: () => ready$.set(true) });
		const compared: unknown[] = [];
		const selected$ = scope.derived$(
			null,
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

	it('retains the committed ready value across successive failed stabilization rounds', () => {
		const scope = createScope({ scopeKey: 'recovered-selector-equality' });
		const enabled$ = scope.signal$(null, false);
		const phase$ = scope.signal$(null, 0);
		const first$ = scope.signal$(null, 0, { watched: () => phase$.set(1) });
		const second$ = scope.signal$(null, 0, { watched: () => phase$.set(2) });
		const comparisons: Array<readonly [{ x: number }, { x: number }]> = [];
		const selected$ = scope.derived$(
			null,
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
