import { describe, it, expect } from 'vitest';
import { act, mount, nextPaint } from './_helpers';
import {
	ConditionalActivityEffect,
	ConditionalActivityReentryEffect,
	ConditionalRepeatedEffects,
	ConditionalSuspenseEffect,
	ConditionalTsrxEffect,
	Guarded,
	PartialGuard,
} from './_fixtures/conditional-hooks.tsrx';
import {
	ConditionalEffectOrder,
	ConditionalEffectPhases,
	ConditionalTsxEffect,
} from './_fixtures/conditional-hooks.tsx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function fulfilled<T>(value: T): PromiseLike<T> {
	return { then() {}, status: 'fulfilled', value } as any;
}

// octane supports runtime-conditional hooks: each hook call site gets a
// stable Symbol.for(stableId) slot from the compiler, so `if (cond) return;`
// before a `useEffect(…)` doesn't break the hook order assumption that
// React's rules-of-hooks exists to defend. The hook simply doesn't run on
// the short-circuited render; when the guard opens later, the hook
// registers and fires normally.

describe('conditional hooks — guard before useEffect', () => {
	it('short-circuited render runs no effect; opening the guard fires it', async () => {
		const log: string[] = [];
		const r = mount(Guarded, { hide: true, log, initialN: 7 });
		// Effect never registered while hide=true.
		await nextPaint();
		expect(log).toEqual([]);
		// Open the guard — body now runs past the early return; effect fires.
		r.update(Guarded, { hide: false, log, initialN: 7 });
		await nextPaint();
		expect(log).toContain('mount:7');
		// Click the button: new state → dep changed → cleanup + fresh mount.
		r.click('#bump');
		await nextPaint();
		expect(log).toContain('cleanup:7');
		expect(log).toContain('mount:8');
		r.unmount();
		await nextPaint();
		// On unmount the current effect's cleanup fires.
		expect(log).toContain('cleanup:8');
	});

	it('hook slots stay stable when the guard opens after a few renders', async () => {
		const log: string[] = [];
		const r = mount(PartialGuard, { hide: true, log });
		await nextPaint();
		// Two hooks ran above the guard (useState ×2), but the effect didn't.
		expect(log).toEqual([]);
		// Re-render with hide=false to traverse past the guard.
		r.update(PartialGuard, { hide: false, log });
		await nextPaint();
		expect(log).toEqual(['seen:0:0']);
		r.click('#bumpN');
		await nextPaint();
		expect(log).toEqual(['seen:0:0', 'seen:1:0']);
		r.click('#bumpM');
		await nextPaint();
		expect(log).toEqual(['seen:0:0', 'seen:1:0', 'seen:1:1']);
		r.unmount();
	});

	it('disconnects an effect when a previously-open guard closes', async () => {
		const log: string[] = [];
		const r = mount(Guarded, { hide: false, log, initialN: 7 });
		await nextPaint();
		expect(log).toEqual(['mount:7']);

		r.update(Guarded, { hide: true, log, initialN: 7 });
		await nextPaint();
		expect(log).toEqual(['mount:7', 'cleanup:7']);

		r.update(Guarded, { hide: false, log, initialN: 7 });
		await nextPaint();
		expect(log).toEqual(['mount:7', 'cleanup:7', 'mount:7']);
		r.unmount();
	});

	it.each([
		['TSX', ConditionalTsxEffect, '.conditional-tsx'],
		['TSRX', ConditionalTsrxEffect, '.conditional-tsrx'],
	] as const)(
		'tears down and recreates an effect skipped by a plain %s conditional',
		async (_dialect, Component, selector) => {
			const log: string[] = [];
			const r = mount(Component, { enabled: true, label: 'A', log });
			await nextPaint();
			expect(log).toEqual(['create:A']);

			r.update(Component, { enabled: false, label: 'B', log });
			await nextPaint();
			expect(r.find(selector).textContent).toBe('B');
			expect(log).toEqual(['create:A', 'cleanup:A']);

			r.update(Component, { enabled: false, label: 'C', log });
			await nextPaint();
			expect(r.find(selector).textContent).toBe('C');
			expect(log).toEqual(['create:A', 'cleanup:A']);

			// Reaching the call site again must recreate it even though its last
			// reached render used the same dependency values.
			r.update(Component, { enabled: true, label: 'A', log });
			await nextPaint();
			expect(log).toEqual(['create:A', 'cleanup:A', 'create:A']);

			r.unmount();
			await nextPaint();
			expect(log).toEqual(['create:A', 'cleanup:A', 'create:A', 'cleanup:A']);
		},
	);

	it('tears down skipped effects in their lifecycle phases', async () => {
		const log: string[] = [];
		const r = mount(ConditionalEffectPhases, { enabled: true, log });
		expect(log).toEqual(['insertion:create', 'layout:create']);
		await nextPaint();
		expect(log).toEqual(['insertion:create', 'layout:create', 'passive:create']);

		r.update(ConditionalEffectPhases, { enabled: false, log });
		expect(log).toEqual([
			'insertion:create',
			'layout:create',
			'passive:create',
			'insertion:cleanup',
			'layout:cleanup',
		]);
		await nextPaint();
		expect(log).toEqual([
			'insertion:create',
			'layout:create',
			'passive:create',
			'insertion:cleanup',
			'layout:cleanup',
			'passive:cleanup',
		]);

		r.update(ConditionalEffectPhases, { enabled: true, log });
		expect(log.slice(-2)).toEqual(['insertion:create', 'layout:create']);
		await nextPaint();
		expect(log.slice(-3)).toEqual(['insertion:create', 'layout:create', 'passive:create']);
		r.unmount();
	});

	it('runs all skipped cleanups before later effect recreation in declaration order', async () => {
		const log: string[] = [];
		const r = mount(ConditionalEffectOrder, { first: true, tick: 0, log });
		await nextPaint();
		expect(log).toEqual(['first:create', 'second:create:0']);

		r.update(ConditionalEffectOrder, { first: false, tick: 1, log });
		await nextPaint();
		expect(log).toEqual([
			'first:create',
			'second:create:0',
			'first:cleanup',
			'second:cleanup:0',
			'second:create:1',
		]);
		r.unmount();
	});

	it('does not tear down for a render that suspends before committing', async () => {
		const log: string[] = [];
		const pending = deferred<string>();
		const r = mount(ConditionalSuspenseEffect, {
			enabled: true,
			log,
			promise: fulfilled('A'),
		});
		await nextPaint();
		expect(log).toEqual(['suspense:create']);

		r.update(ConditionalSuspenseEffect, {
			enabled: false,
			log,
			promise: pending.promise,
		});
		expect(r.find('.conditional-suspense-pending').textContent).toBe('pending');
		await nextPaint();
		expect(log).toEqual(['suspense:create']);

		await act(() => pending.resolve('B'));
		expect(r.find('.conditional-suspense-value').textContent).toBe('B');
		expect(log).toEqual(['suspense:create', 'suspense:cleanup']);
		r.unmount();
	});

	it('does not reconnect an effect omitted by a completed hidden Activity render', async () => {
		const log: string[] = [];
		const r = mount(ConditionalActivityEffect, { enabled: true, log, mode: 'visible' });
		await nextPaint();
		expect(log).toEqual(['activity:create']);

		r.update(ConditionalActivityEffect, { enabled: false, log, mode: 'hidden' });
		await nextPaint();
		expect(log).toEqual(['activity:create', 'activity:cleanup']);

		// The memoized child bails during reveal. Its old effect body must have
		// been forgotten when the hidden render omitted that call site.
		r.update(ConditionalActivityEffect, { enabled: false, log, mode: 'visible' });
		await nextPaint();
		expect(r.find('.conditional-activity').textContent).toBe('disabled');
		expect(log).toEqual(['activity:create', 'activity:cleanup']);

		r.update(ConditionalActivityEffect, { enabled: true, log, mode: 'visible' });
		await nextPaint();
		expect(log).toEqual(['activity:create', 'activity:cleanup', 'activity:create']);
		r.unmount();
		await nextPaint();
		expect(log).toEqual([
			'activity:create',
			'activity:cleanup',
			'activity:create',
			'activity:cleanup',
		]);
	});

	it('preserves repeated enqueues through one effective custom-hook slot', async () => {
		const log: string[] = [];
		const r = mount(ConditionalRepeatedEffects, { enabled: true, log });
		await nextPaint();
		expect(log).toEqual(['shared:create:first', 'shared:create:second']);

		r.update(ConditionalRepeatedEffects, { enabled: false, log });
		await nextPaint();
		expect(log).toEqual(['shared:create:first', 'shared:create:second', 'shared:cleanup:second']);

		r.update(ConditionalRepeatedEffects, { enabled: true, log });
		await nextPaint();
		expect(log.slice(-2)).toEqual(['shared:create:first', 'shared:create:second']);
		r.unmount();
	});

	it('invalidates hidden teardown when the effect call site is reached again', async () => {
		const log: string[] = [];
		let setEnabled!: (enabled: boolean) => void;
		const expose = (set: (enabled: boolean) => void) => {
			setEnabled = set;
		};
		const r = mount(ConditionalActivityReentryEffect, {
			expose,
			log,
			mode: 'visible',
		});
		await nextPaint();
		expect(log).toEqual(['reentry:create']);

		r.update(ConditionalActivityReentryEffect, { expose, log, mode: 'hidden' });
		expect(log).toEqual(['reentry:create', 'reentry:cleanup']);

		setEnabled(false);
		setEnabled(true);
		r.update(ConditionalActivityReentryEffect, { expose, log, mode: 'visible' });
		await nextPaint();
		expect(r.find('.conditional-activity-reentry').textContent).toBe('enabled');
		expect(log).toEqual(['reentry:create', 'reentry:cleanup', 'reentry:create']);
		r.unmount();
	});

	it('does not let an unregistered hidden call site mask an omitted effect', async () => {
		const log: string[] = [];
		let setEnabled!: (enabled: boolean) => void;
		const expose = (set: (enabled: boolean) => void) => {
			setEnabled = set;
		};
		const r = mount(ConditionalActivityReentryEffect, {
			expose,
			log,
			mode: 'visible',
		});
		await nextPaint();

		r.update(ConditionalActivityReentryEffect, { expose, log, mode: 'hidden' });
		setEnabled(false);
		r.update(ConditionalActivityReentryEffect, { expose, log, mode: 'visible' });
		await nextPaint();

		expect(r.find('.conditional-activity-reentry').textContent).toBe('disabled');
		expect(log).toEqual(['reentry:create', 'reentry:cleanup']);
		r.unmount();
	});
});
