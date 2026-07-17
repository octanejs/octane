import { describe, it, expect, vi } from 'vitest';
import { mount, nextPaint } from './_helpers';
import {
	LazyInit,
	TwoStates,
	Tally,
	MemoTest,
	CustomMemoDeps,
	CustomMemoPair,
	CastCustomMemoPair,
	BuiltinLookalike,
	StableResultLookalikes,
	CustomSelectorCallback,
	CbTest,
	RefTest,
	EffectMount,
	EffectDeps,
	CustomEffectDeps,
	EffectAlways,
	LayoutVsEffect,
} from './_fixtures/hooks.tsrx';

describe('useState', () => {
	it('runs lazy initializer once', () => {
		const r = mount(LazyInit);
		expect(r.find('span').textContent).toBe('42');
		r.unmount();
	});

	it('isolates separate slots', () => {
		const r = mount(TwoStates);
		expect(r.find('#a').textContent).toBe('1');
		expect(r.find('#b').textContent).toBe('10');
		r.click('#a');
		expect(r.find('#a').textContent).toBe('2');
		expect(r.find('#b').textContent).toBe('10');
		r.click('#b');
		r.click('#b');
		expect(r.find('#a').textContent).toBe('2');
		expect(r.find('#b').textContent).toBe('14');
		r.unmount();
	});
});

describe('useReducer', () => {
	it('dispatches actions', () => {
		const r = mount(Tally);
		expect(r.find('button').textContent).toBe('0');
		r.click('button');
		r.click('button');
		expect(r.find('button').textContent).toBe('10');
		r.unmount();
	});
});

describe('useMemo', () => {
	it('recomputes only when deps change', () => {
		const r = mount(MemoTest, { n: 3 });
		expect(r.find('.val').textContent).toBe('6');
		expect(r.find('.count').textContent).toBe('1');
		// same props → no recompute
		r.update(MemoTest, { n: 3 });
		expect(r.find('.val').textContent).toBe('6');
		expect(r.find('.count').textContent).toBe('1');
		// props change → recompute
		r.update(MemoTest, { n: 5 });
		expect(r.find('.val').textContent).toBe('10');
		expect(r.find('.count').textContent).toBe('2');
		r.unmount();
	});

	it('infers dependencies for a local custom memo hook', () => {
		const compute = vi.fn((value: string) => value.toUpperCase());
		const r = mount(CustomMemoDeps, { compute, value: 'a', noise: 0 });
		expect(r.find('.value').textContent).toBe('A');
		expect(compute).toHaveBeenCalledTimes(1);

		r.update(CustomMemoDeps, { compute, value: 'a', noise: 1 });
		expect(r.find('.value').textContent).toBe('A');
		expect(compute).toHaveBeenCalledTimes(1);

		r.update(CustomMemoDeps, { compute, value: 'b', noise: 2 });
		expect(r.find('.value').textContent).toBe('B');
		expect(compute).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	it('keeps repeated local custom memo calls independent', () => {
		const r = mount(CustomMemoPair, { value: '1' });
		expect(r.find('span').textContent).toBe('A1/B1');
		r.update(CustomMemoPair, { value: '2' });
		expect(r.find('span').textContent).toBe('A2/B2');
		r.unmount();
	});

	it('does not infer a custom memo call without a custom-hook slot boundary', () => {
		const r = mount(CastCustomMemoPair, { value: '1' });
		expect(r.find('span').textContent).toBe('A1/B1');
		r.update(CastCustomMemoPair, { value: '2' });
		expect(r.find('span').textContent).toBe('A2/B2');
		r.unmount();
	});

	it('does not infer dependencies for a lexically bound built-in lookalike', () => {
		const r = mount(BuiltinLookalike, { value: 'selected' });
		expect(r.find('span').textContent).toBe('selected');
		r.unmount();
	});

	it('keeps fresh results from built-in lookalikes reactive', () => {
		const r = mount(StableResultLookalikes, { value: 'a' });
		expect(r.find('span').textContent).toBe('a/a');
		r.update(StableResultLookalikes, { value: 'b' });
		expect(r.find('span').textContent).toBe('b/b');
		r.unmount();
	});

	it('does not infer dependencies for arbitrary custom-hook callbacks', () => {
		const r = mount(CustomSelectorCallback, { value: 'selected' });
		expect(r.find('span').textContent).toBe('selected');
		r.unmount();
	});
});

describe('useCallback', () => {
	it('value passed through useCallback is preserved across renders', () => {
		// Identity stability and dep tracking live in callbacks.test.ts via
		// CallbackIdentity. Here we just smoke-test the basic shape: a useCallback
		// declared in a component body renders successfully AND its identity
		// closes over the dep-array prop (label propagates to the span).
		const r = mount(CbTest, { label: 'hi' });
		expect(r.find('span').textContent).toBe('hi');
		r.update(CbTest, { label: 'bye' });
		expect(r.find('span').textContent).toBe('bye');
		r.unmount();
	});
});

describe('useRef', () => {
	it('survives across renders, mutation does not retrigger', () => {
		const r = mount(RefTest);
		expect(r.find('button').textContent).toBe('0');
		r.click('button');
		expect(r.find('button').textContent).toBe('1');
		r.click('button');
		expect(r.find('button').textContent).toBe('2');
		r.unmount();
	});
});

describe('useEffect', () => {
	it('fires once after mount, fires cleanup on unmount', async () => {
		const onMount = vi.fn();
		const onUnmount = vi.fn();
		const r = mount(EffectMount, { onMount, onUnmount });
		// passive effects fire after paint; wait
		await nextPaint();
		expect(onMount).toHaveBeenCalledTimes(1);
		expect(onUnmount).toHaveBeenCalledTimes(0);
		r.unmount();
		// Passive destroys defer to the passive flush (React parity).
		await nextPaint();
		expect(onUnmount).toHaveBeenCalledTimes(1);
	});

	it('re-fires when deps change', async () => {
		const cb = vi.fn();
		const r = mount(EffectDeps, { cb, n: 1 });
		await nextPaint();
		expect(cb).toHaveBeenLastCalledWith(1);
		expect(cb).toHaveBeenCalledTimes(1);
		r.update(EffectDeps, { cb, n: 1 });
		await nextPaint();
		expect(cb).toHaveBeenCalledTimes(1); // unchanged deps
		r.update(EffectDeps, { cb, n: 2 });
		await nextPaint();
		expect(cb).toHaveBeenCalledTimes(2);
		expect(cb).toHaveBeenLastCalledWith(2);
		r.unmount();
	});

	it('infers dependencies for a local custom effect hook', async () => {
		const cb = vi.fn();
		const r = mount(CustomEffectDeps, { cb, value: 'a', noise: 0 });
		await nextPaint();
		expect(cb).toHaveBeenLastCalledWith('a');
		expect(cb).toHaveBeenCalledTimes(1);

		r.update(CustomEffectDeps, { cb, value: 'a', noise: 1 });
		await nextPaint();
		expect(cb).toHaveBeenCalledTimes(1);

		r.update(CustomEffectDeps, { cb, value: 'b', noise: 2 });
		await nextPaint();
		expect(cb).toHaveBeenLastCalledWith('b');
		expect(cb).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	it('accepts null as the explicit every-render form', async () => {
		const cb = vi.fn();
		const r = mount(EffectAlways, { cb, n: 1 });
		await nextPaint();
		expect(cb).toHaveBeenCalledTimes(1);
		r.update(EffectAlways, { cb, n: 1 });
		await nextPaint();
		expect(cb).toHaveBeenCalledTimes(2);
		r.unmount();
	});
});

describe('three-phase effect pipeline', () => {
	it('insertion before layout before passive', async () => {
		const order: string[] = [];
		const r = mount(LayoutVsEffect, { order });
		// insertion + layout fire synchronously during commit
		expect(order).toEqual(['i', 'l']);
		await nextPaint();
		expect(order).toEqual(['i', 'l', 'e']);
		r.unmount();
	});
});
