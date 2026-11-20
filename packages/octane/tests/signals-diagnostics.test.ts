import { describe, expect, it, vi } from 'vitest';
import { createScope, observeSignalChanges, type SignalHandle } from 'octane/signals';

describe('signal change diagnostics', () => {
	it('does not report initial keyed writable refresh as a value change', () => {
		const scope = createScope({ scopeKey: 'first-keyed-write' });
		const source$ = scope.signal$('source', 1);
		const events: string[] = [];
		const stop = observeSignalChanges((handle$, phase) => {
			if (handle$ === source$) events.push(phase);
		});
		source$.set(1);
		expect(events).toEqual(['write']);
		source$.set(2);
		expect(events).toEqual(['write', 'write', 'change']);
		stop();
		scope.dispose();
	});

	it.each(['get', 'subscribe'] as const)('reports keyed derived changes through %s', (mode) => {
		const scope = createScope({ scopeKey: `keyed-derived-${mode}` });
		const source$ = scope.signal$('source', 1);
		const derived$ = scope.derived$('derived', () => source$.get() * 2);
		derived$.get();
		const release = mode === 'subscribe' ? derived$.subscribe(() => {}) : () => {};
		const events: string[] = [];
		const stop = observeSignalChanges((handle$, phase) => {
			if (handle$ === derived$) events.push(phase);
		});
		source$.set(2);
		if (mode === 'get') derived$.get();
		expect(events).toEqual(['change']);
		stop();
		release();
		scope.dispose();
	});

	it('prevents diagnostic callbacks from changing an updater result', () => {
		const scope = createScope({ scopeKey: 'observer-write-guard' });
		const source$ = scope.signal$(null, 0);
		const stop = observeSignalChanges((signal$, phase) => {
			if (signal$ === source$ && phase === 'write') source$.set(10);
		});
		source$.set((value) => value + 1);
		expect(source$.get()).toBe(1);
		stop();
		scope.dispose();
	});

	it('keeps duplicate callback registrations independent', () => {
		const scope = createScope({ scopeKey: 'duplicate-diagnostics' });
		const source$ = scope.signal$(null, 0);
		const observer = vi.fn();
		const first = observeSignalChanges(observer);
		const second = observeSignalChanges(observer);
		first();
		first();
		source$.set(1);
		expect(observer).toHaveBeenCalledTimes(2);
		second();
		scope.dispose();
	});

	it.each([null, 'source'])(
		'observes %s writes and derived changes without activating watches',
		(key) => {
			const scope = createScope({ scopeKey: `diagnostics-${key}` });
			const watched = vi.fn();
			const source$ = scope.signal$(key, 1, { watched });
			const derived$ = scope.derived$(key === null ? null : 'derived', () => source$.get() * 2);
			const events: Array<[SignalHandle<unknown>, 'write' | 'change']> = [];
			const stopThrowing = observeSignalChanges(() => {
				throw new Error('diagnostic failure');
			});
			const stop = observeSignalChanges((signal$, phase) => events.push([signal$, phase]));
			expect(watched).not.toHaveBeenCalled();
			const release = scope.effect(() => {
				derived$.get();
			});
			events.length = 0;
			source$.set(1);
			source$.set(2);
			expect(events).toEqual([
				[source$, 'write'],
				[source$, 'write'],
				[source$, 'change'],
				[derived$, 'change'],
			]);
			stopThrowing();
			stop();
			events.length = 0;
			source$.set(3);
			expect(events).toEqual([]);
			release();
			scope.dispose();
		},
	);
});
