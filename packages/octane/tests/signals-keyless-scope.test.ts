import { expect, it } from 'vitest';
import {
	createFamily,
	createKeylessScope,
	isSignalHandle,
	isSignalReadOnly,
	isWritableSignal,
	observeSignalChanges,
} from 'octane/signals/core';

it('refreshes a subscribed derived value with only the core entry loaded', () => {
	const scope = createKeylessScope({ scopeKey: 'counter' });
	const count$ = scope.signal$(null, 1);
	const double$ = scope.derived$(null, () => count$.get() * 2);
	const seen: number[] = [];
	expect(double$.get()).toBe(2);
	const stop = double$.subscribe(() => {
		seen.push(double$.get());
	});
	try {
		count$.set(2);
		expect(seen).toEqual([4]);
	} finally {
		stop();
		scope.dispose();
	}
});

it('keeps a keyless family live while observed and retires it with the scope', () => {
	const scope = createKeylessScope({ scopeKey: 'rows' });
	const lifecycle: string[] = [];
	const family = createFamily(scope, (name: string) =>
		scope.signal$(null, 1, {
			watched() {
				lifecycle.push('watch ' + name);
				return () => {
					lifecycle.push('release ' + name);
				};
			},
		}),
	);
	const row$ = family.get('A');
	const parity$ = scope.derived$(null, () => ({ odd: row$.get() % 2 === 1 }), {
		equals: (a, b) => a.odd === b.odd,
	});
	const reads: boolean[] = [];
	scope.effect(() => {
		reads.push(parity$.get().odd);
	});
	expect(isSignalHandle(parity$)).toBe(true);
	expect(isWritableSignal(row$)).toBe(true);
	const phases: string[] = [];
	const stop = observeSignalChanges((signal, phase) => {
		if (signal === row$) phases.push(phase);
	});
	try {
		scope.set(row$, 3);
		scope.batch(() => {
			row$.set(5);
			row$.set(6);
		});
		expect(scope.get(row$)).toBe(6);
		expect(reads).toEqual([true, false]);
		expect(phases).toContain('write');
		expect(lifecycle).toEqual(['watch A']);
	} finally {
		stop();
		scope.dispose();
	}
	expect(lifecycle).toEqual(['watch A', 'release A']);
	expect(() => row$.get()).toThrow();
	expect(() => family.get('B')).toThrow();
});

it('shares one journal and dependency graph when full scopes load later', async () => {
	const core = createKeylessScope({ scopeKey: 'draft' });
	const left$ = core.signal$(null, 2);
	const { createScope } = await import('octane/signals');
	const full = createScope({ scopeKey: 'document' });
	const right$ = full.signal$('right', 10);
	const sum$ = full.derived$('sum', () => left$.get() + right$.get());
	const twice$ = core.derived$(null, () => sum$.get() * 2);
	const seen: number[] = [];
	const stop = twice$.subscribe(() => {
		seen.push(twice$.get());
	});
	try {
		const edit = core.transaction(() => {
			left$.set(5);
			right$.set(20);
		});
		edit.undo();
		edit.redo();
		expect(() =>
			full.transaction(() => {
				left$.set(0);
				right$.set(0);
				throw new Error('cancel');
			}),
		).toThrow('cancel');
		expect(seen).toEqual([50, 24, 50]);
		expect(twice$.get()).toBe(50);
		expect(core.derived$(null, isSignalReadOnly).get()).toBe(true);
	} finally {
		stop();
		core.dispose();
		full.dispose();
	}
});

it('rejects keys and writes through a different owner', () => {
	const scope = createKeylessScope({ scopeKey: 'one' });
	const foreign = createKeylessScope({ scopeKey: 'two' });
	const item$ = foreign.signal$(null, 0);
	try {
		// @ts-expect-error Keyless scopes only accept null.
		expect(() => scope.signal$('key', 0)).toThrow(TypeError);
		// @ts-expect-error Keyless scopes only accept null.
		expect(() => scope.derived$('key', () => 0)).toThrow(TypeError);
		expect(() => scope.set(item$, 1)).toThrow(TypeError);
		expect(item$.get()).toBe(0);
	} finally {
		scope.dispose();
		foreign.dispose();
	}
});
