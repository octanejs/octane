import { describe, it, expect } from 'vitest';
import { mount, act, flushEffects } from './_helpers';
import {
	IfSwap,
	CompSwap,
	IfDoubleSwap,
	CompDoubleSwap,
} from './_fixtures/transition-replacements.tsrx';

const tick = () => new Promise((res) => setTimeout(res, 0));

describe('transitions preserve visible content while replacements suspend', () => {
	it('@if: a suspending incoming branch holds A, then commits once on resolve', async () => {
		const d = deferred<number>();
		const r = mount(IfSwap as any, { log: () => {}, suspend: true, promise: d.promise });
		await act(() => {});
		expect(r.find('.content').textContent).toBe('A');

		// Starting the transition keeps the old content visible without flashing
		// the fallback while the replacement is pending.
		r.click('#go');
		for (let i = 0; i < 4; i++) await tick();
		expect(r.find('.content').textContent).toBe('A'); // old branch held
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		d.resolve(2);
		for (let i = 0; i < 6; i++) await tick();
		flushEffects();
		expect(r.find('.content').textContent).toBe('B-2');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('a suspending incoming component holds A, then commits on resolve', async () => {
		const d = deferred<number>();
		const r = mount(CompSwap as any, { log: () => {}, suspend: true, promise: d.promise });
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

describe('transition replacements survive repeated branch and component swaps', () => {
	it('@if: A→B→A under transitions leaves correct DOM each step', async () => {
		const r = mount(IfDoubleSwap as any, { log: () => {} });
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

		// A third swap ensures the branch remains live after repeated replacement.
		r.click('#toB');
		await act(() => {});
		expect(r.find('.content').textContent).toBe('B');
		expect(r.findAll('.content')).toHaveLength(1);
		r.unmount();
	});

	it('a dynamic component leaves correct DOM after A→B→A swaps', async () => {
		const r = mount(CompDoubleSwap as any, { log: () => {} });
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
