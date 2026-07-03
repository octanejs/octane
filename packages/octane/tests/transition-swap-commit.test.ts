import { describe, it, expect } from 'vitest';
import { mount, act, createLog, flushEffects } from './_helpers';
import {
	IfSwap,
	SwitchSwap,
	CompSwap,
	ChildSwap,
	IfDoubleSwap,
	CompDoubleSwap,
} from './_fixtures/transition-swap-commit.tsrx';

// ============================================================================
// Transition probe-tax optimization: a subtree swapped in under startTransition
// must render its body EXACTLY ONCE per off-screen pass. Previously componentSlot
// and renderBranchSlot rendered the incoming subtree OFF-SCREEN, threw it away,
// then rendered it AGAIN in place (a full double render). Both now COMMIT the
// off-screen WIP the way childSlot already did, so the incoming body executes the
// same number of times as the childSlot baseline. See runtime.ts commentary at
// componentSlot / renderBranchSlot.
//
// Baseline (before the fix): the incoming body logged 3x per swap at @if,
// @switch, and componentSlot (off-screen probe + in-place re-render + isPending-
// false urgent re-render), vs childSlot's 2x. After the fix all four log 2x
// (off-screen render COMMITTED + the isPending-false re-render).
// ============================================================================

const tick = () => new Promise((res) => setTimeout(res, 0));

function countB(entries: string[]): number {
	return entries.filter((e) => e === 'B').length;
}

describe('probe-tax: incoming body renders ONCE per off-screen swap (no double render)', () => {
	it('childSlot baseline: incoming body runs twice (off-screen commit + isPending re-render)', async () => {
		const log = createLog();
		const r = mount(ChildSwap as any, { log: log.push });
		await act(() => {});
		log.drain();
		r.click('#go');
		await act(() => {});
		expect(countB(log.drain())).toBe(2);
		expect(r.find('.content').textContent).toBe('B');
		r.unmount();
	});

	it('(a) @if branch (JSX ternary → renderBranchSlot): once per off-screen pass, matching childSlot', async () => {
		const log = createLog();
		const r = mount(IfSwap as any, { log: log.push });
		await act(() => {});
		log.drain();
		r.click('#go');
		await act(() => {});
		// 2, not 3: the off-screen render is COMMITTED instead of discarded + redone.
		expect(countB(log.drain())).toBe(2);
		expect(r.find('.content').textContent).toBe('B');
		expect(r.findAll('#fallback')).toHaveLength(0);
		r.unmount();
	});

	it('(b) @switch case (renderBranchSlot): once per off-screen pass', async () => {
		const log = createLog();
		const r = mount(SwitchSwap as any, { log: log.push });
		await act(() => {});
		log.drain();
		r.click('#go');
		await act(() => {});
		expect(countB(log.drain())).toBe(2);
		expect(r.find('.content').textContent).toBe('B');
		r.unmount();
	});

	it('(c) dynamic <Comp/> (componentSlot): once per off-screen pass', async () => {
		const log = createLog();
		const r = mount(CompSwap as any, { log: log.push });
		await act(() => {});
		log.drain();
		r.click('#go');
		await act(() => {});
		expect(countB(log.drain())).toBe(2);
		expect(r.find('.content').textContent).toBe('B');
		r.unmount();
	});
});

describe('probe-tax: suspend-during-probe still disposes + holds the old content', () => {
	it('@if: a suspending incoming branch holds A, then commits once on resolve', async () => {
		const log = createLog();
		const d = deferred<number>();
		const r = mount(IfSwap as any, { log: log.push, suspend: true, promise: d.promise });
		await act(() => {});
		expect(r.find('.content').textContent).toBe('A');
		log.drain();

		// Transition → suspending branch. Off-screen render throws → disposeWip +
		// rethrow → the enclosing @try holds the OLD content (A). No fallback flash.
		r.click('#go');
		for (let i = 0; i < 4; i++) await tick();
		expect(r.find('.content').textContent).toBe('A'); // old branch held
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		// Resolve → the off-screen render now completes and COMMITS.
		d.resolve(2);
		for (let i = 0; i < 6; i++) await tick();
		flushEffects();
		expect(r.find('.content').textContent).toBe('B-2');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('componentSlot: a suspending incoming component holds A, then commits on resolve', async () => {
		const log = createLog();
		const d = deferred<number>();
		const r = mount(CompSwap as any, { log: log.push, suspend: true, promise: d.promise });
		await act(() => {});
		expect(r.find('.content').textContent).toBe('A');

		r.click('#go');
		for (let i = 0; i < 4; i++) await tick();
		expect(r.find('.content').textContent).toBe('A'); // old component held
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		d.resolve(3);
		for (let i = 0; i < 6; i++) await tick();
		flushEffects();
		expect(r.find('.content').textContent).toBe('B-3');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});
});

describe('probe-tax: double-swap A→B→A survives adopted-marker / exclusiveMarkers bookkeeping', () => {
	it('@if: A→B→A under transitions leaves correct DOM each step', async () => {
		const log = createLog();
		const r = mount(IfDoubleSwap as any, { log: log.push });
		await act(() => {});
		expect(r.find('.content').textContent).toBe('A');

		r.click('#toB');
		await act(() => {});
		expect(r.find('.content').textContent).toBe('B');
		// Exactly one content node — the old range's markers/content were removed.
		expect(r.findAll('.content')).toHaveLength(1);

		r.click('#toA');
		await act(() => {});
		expect(r.find('.content').textContent).toBe('A');
		expect(r.findAll('.content')).toHaveLength(1);

		// A third swap proves the adopted markers from the 2nd commit still bound the
		// slot (a corrupt boundary would insertBefore against a detached node here).
		r.click('#toB');
		await act(() => {});
		expect(r.find('.content').textContent).toBe('B');
		expect(r.findAll('.content')).toHaveLength(1);
		r.unmount();
	});

	it('componentSlot: A→B→A under transitions leaves correct DOM each step', async () => {
		const log = createLog();
		const r = mount(CompDoubleSwap as any, { log: log.push });
		await act(() => {});
		expect(r.find('.content').textContent).toBe('A');

		r.click('#toB');
		await act(() => {});
		expect(r.find('.content').textContent).toBe('B');
		expect(r.findAll('.content')).toHaveLength(1);

		r.click('#toA');
		await act(() => {});
		expect(r.find('.content').textContent).toBe('A');
		expect(r.findAll('.content')).toHaveLength(1);

		r.click('#toB');
		await act(() => {});
		expect(r.find('.content').textContent).toBe('B');
		expect(r.findAll('.content')).toHaveLength(1);
		r.unmount();
	});
});

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}
