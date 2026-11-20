import { describe, expect, it } from 'vitest';
import { createScope, type WritableSignal } from 'octane/signals';

describe('watched keyless stabilization', () => {
	it('releases dynamically rewired dependencies after watched setup', () => {
		const scope = createScope({ scopeKey: 'rewired-watch' });
		const events: string[] = [];
		let selected$: WritableSignal<boolean>;
		selected$ = scope.signal$(null, false, {
			watched: () => {
				selected$.set(true);
				result$.get();
				return () => {
					selected$.set(false);
					result$.get();
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
		let source: WritableSignal<number>;
		source = scope.signal$(null, 0, { watched: () => source.set(1) });
		const value = scope.derived$(null, () => {
			const current = source.get();
			if (current === 0) throw new Error('not ready');
			return current;
		});
		const seen: number[] = [];
		const stop = scope.effect(() => {
			seen.push(value.get());
		});
		expect(seen).toEqual([1]);
		stop();
		scope.dispose();
	});

	it('recomputes when watched setup changes an earlier dependency', () => {
		const scope = createScope({ scopeKey: 'stabilize-watch' });
		const enabled = scope.signal$(null, false);
		const earlier = scope.signal$(null, 0);
		const watched = scope.signal$(null, 0, { watched: () => earlier.set(1) });
		const value = scope.derived$(null, () => {
			const first = earlier.get();
			return enabled.get() ? first + watched.get() : first;
		});
		const seen: number[] = [];
		const stop = scope.effect(() => {
			seen.push(value.get());
		});
		enabled.set(true);
		expect(seen).toEqual([0, 1]);
		stop();
		scope.dispose();
	});
	it('notifies a pending subscriber when a later equal dependency starts a watched source', () => {
		const scope = createScope({ scopeKey: 'pending-subscriber-watch' });
		const enabled = scope.signal$(null, false);
		const earlier = scope.signal$(null, 0);
		const watched = scope.signal$(null, 0, { watched: () => earlier.set(1) });
		const inner = scope.derived$(null, () => (enabled.get() ? watched.get() : 0));
		const outer = scope.derived$(null, () => earlier.get() + inner.get());
		const seen: number[] = [];
		const stop = outer.subscribe(() => seen.push(outer.get()));
		enabled.set(true);
		expect(seen).toEqual([1]);
		stop();
		scope.dispose();
	});
});
