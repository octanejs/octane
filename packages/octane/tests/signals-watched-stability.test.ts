import { describe, expect, it } from 'vitest';
import { createScope, type WritableSignal } from 'octane/signals';

describe('watched keyless stabilization', () => {
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
});
