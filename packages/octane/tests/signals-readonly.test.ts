import { describe, expect, it } from 'vitest';
import { createScope, isSignalReadOnly } from 'octane/signals';

describe('signal read-only context', () => {
	it('matches signal write guards in ordinary, updater, computed, watched and frame reads', () => {
		const scope = createScope({ scopeKey: 'read-only-context' });
		const states: boolean[] = [];
		const source = scope.signal$('source', 1, {
			watched: () => {
				states.push(isSignalReadOnly());
			},
		});
		expect(isSignalReadOnly()).toBe(false);
		source.set((value) => {
			expect(isSignalReadOnly()).toBe(true);
			return value + 1;
		});
		const keyed = scope.derived$('keyed', () => {
			expect(isSignalReadOnly()).toBe(true);
			return source.get();
		});
		const keyless = scope.derived$(null, () => {
			expect(isSignalReadOnly()).toBe(true);
			return source.get();
		});
		const stop = scope.effect(() => {
			keyed.get();
			keyless.get();
		});
		expect(states).toEqual([false]);
		const frame = scope.beginAdoption(scope.serialize());
		frame.run(() => {
			expect(isSignalReadOnly()).toBe(true);
		});
		frame.release();
		stop();
		expect(isSignalReadOnly()).toBe(false);
		scope.dispose();
	});
});
