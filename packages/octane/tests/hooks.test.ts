import { describe, it, expect, vi } from 'vitest';
import { act, mount, nextPaint, flushEffects } from './_helpers';
import { flushSync, startTransition } from '../src/index.js';
import {
	LazyInit,
	TwoStates,
	StateValueProbe,
	Tally,
	MemoTest,
	CustomMemoDeps,
	CustomMemoPair,
	CastCustomMemoPair,
	BuiltinLookalike,
	StableResultLookalikes,
	CustomSelectorCallback,
	CbTest,
	ForwardedCallbackPair,
	CallbackRenderPass,
	RefTest,
	EffectMount,
	EffectDeps,
	CustomEffectDeps,
	EffectAlways,
	EffectArguments,
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

	it('replays functional Action updates and replacements in dispatch order', async () => {
		let setValue!: (next: number | ((previous: number) => number)) => void;
		let getValue!: () => number;
		let releaseFirst!: () => void;
		let releaseFinal!: () => void;
		const first = new Promise<void>((resolve) => (releaseFirst = resolve));
		const final = new Promise<void>((resolve) => (releaseFinal = resolve));
		const r = mount(StateValueProbe, {
			initial: 1,
			display: String,
			expose: (set: typeof setValue, get: typeof getValue) => {
				setValue = set;
				getValue = get;
			},
		});
		try {
			flushSync(() =>
				startTransition(async () => {
					setValue((value) => value + 10);
					await first;
					setValue(40);
					setValue((value) => value + 2);
					await final;
				}),
			);
			expect(r.find('span').textContent).toBe('1');
			expect(getValue()).toBe(11);
			flushSync(() => setValue(5));
			expect(r.find('span').textContent).toBe('5');
			expect(getValue()).toBe(5);

			await act(() => releaseFirst());
			expect(r.find('span').textContent).toBe('5');
			expect(getValue()).toBe(42);
			flushSync(() => setValue(9));
			expect(r.find('span').textContent).toBe('9');
			expect(getValue()).toBe(9);

			await act(() => releaseFinal());
			expect(r.find('span').textContent).toBe('9');
			expect(getValue()).toBe(9);
		} finally {
			releaseFirst();
			releaseFinal();
			await act(() => {});
			r.unmount();
		}
	});

	it('retains function-valued state through urgent and staged replacements', async () => {
		type Value = () => string;
		let setValue!: (next: Value | ((previous: Value) => Value)) => void;
		let getValue!: () => Value;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const initial = () => 'initial';
		const staged = () => 'staged';
		const urgent = () => 'urgent';
		const r = mount(StateValueProbe, {
			initial,
			display: (value: Value) => value(),
			expose: (set: typeof setValue, get: typeof getValue) => {
				setValue = set;
				getValue = get;
			},
		});
		try {
			flushSync(() =>
				startTransition(async () => {
					setValue(() => staged);
					await gate;
				}),
			);
			expect(r.find('span').textContent).toBe('initial');
			expect(getValue()).toBe(staged);
			flushSync(() => setValue(() => urgent));
			expect(r.find('span').textContent).toBe('urgent');
			expect(getValue()).toBe(urgent);
			await act(() => release());
			expect(r.find('span').textContent).toBe('urgent');
			expect(getValue()).toBe(urgent);
		} finally {
			release();
			await act(() => {});
			r.unmount();
		}
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

	it('preserves each custom-hook callback value without invoking it while comparing dependencies', () => {
		const first = vi.fn(() => 'first');
		const second = vi.fn(() => 'second');
		const nextFirst = vi.fn(() => 'next-first');
		const nextSecond = vi.fn(() => 'next-second');
		const observed: Array<[() => string, () => string]> = [];
		const observe = (left: () => string, right: () => string) => {
			observed.push([left, right]);
		};
		const root = mount(ForwardedCallbackPair, {
			first,
			second,
			dependencies: [NaN, 0],
			observe,
			label: 'initial',
		});
		expect(observed.at(-1)).toEqual([first, second]);
		expect(first).not.toHaveBeenCalled();
		expect(second).not.toHaveBeenCalled();

		root.update(ForwardedCallbackPair, {
			first: nextFirst,
			second: nextSecond,
			dependencies: [NaN, 0],
			observe,
			label: 'same',
		});
		expect(root.find('span').textContent).toBe('same');
		expect(observed.at(-1)).toEqual([first, second]);
		expect(nextFirst).not.toHaveBeenCalled();
		expect(nextSecond).not.toHaveBeenCalled();

		root.update(ForwardedCallbackPair, {
			first: nextFirst,
			second: nextSecond,
			dependencies: [NaN, -0],
			observe,
			label: 'changed',
		});
		expect(observed.at(-1)).toEqual([nextFirst, nextSecond]);
		expect(observed.at(-1)?.[0]()).toBe('next-first');
		expect(observed.at(-1)?.[1]()).toBe('next-second');

		root.update(ForwardedCallbackPair, {
			first,
			second,
			dependencies: null,
			observe,
			label: 'always',
		});
		expect(observed.at(-1)).toEqual([first, second]);
		root.update(ForwardedCallbackPair, {
			first: nextFirst,
			second: nextSecond,
			dependencies: null,
			observe,
			label: 'always-again',
		});
		expect(observed.at(-1)).toEqual([nextFirst, nextSecond]);
		root.unmount();
	});

	it('keeps a custom-hook callback across a render-phase state retry', () => {
		const observed: Array<() => number> = [];
		const root = mount(CallbackRenderPass, {
			observe: (callback: () => number) => observed.push(callback),
		});
		expect(root.find('span').textContent).toBe('step=1 callback=0');
		expect(observed.at(-1)).toBe(observed[0]);
		root.unmount();
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

	describe.each<{ label: string; deps: unknown[] | null | undefined }>([
		{ label: 'undefined dependencies', deps: undefined },
		{ label: 'null dependencies', deps: null },
		{ label: 'empty dependencies', deps: [] },
		{ label: 'one dependency', deps: [1] },
		{ label: 'two dependencies', deps: [1, 'two'] },
		{ label: 'three dependencies', deps: [1, 'two', null] },
		{ label: 'four dependencies', deps: [1, 'two', null, undefined] },
	])('$label', ({ deps }) => {
		it('passes positional values with a null receiver and retains each setup’s cleanup', () => {
			const phases = ['insertion', 'layout', 'passive'] as const;
			type Phase = (typeof phases)[number];
			const logs: Record<Phase, unknown[]> = { insertion: [], layout: [], passive: [] };
			const propsFor = (dependencies: unknown[] | null | undefined, version: number) => {
				const callbackFor = (phase: Phase) =>
					function (this: unknown, ...args: unknown[]) {
						logs[phase].push(['setup', version, this, args]);
						return () => {
							logs[phase].push(['cleanup', version, args]);
						};
					};
				return {
					deps: dependencies,
					label: String(version),
					insertion: callbackFor('insertion'),
					layout: callbackFor('layout'),
					passive: callbackFor('passive'),
				};
			};
			const firstArgs = deps ?? [];
			const r = mount(EffectArguments, propsFor(deps, 1));
			flushEffects();
			for (const phase of phases) {
				expect(logs[phase]).toEqual([['setup', 1, null, firstArgs]]);
			}

			const nextDeps = deps?.map((_, index) => `updated-${index}`) ?? deps;
			const nextArgs = nextDeps ?? [];
			const repeats = deps == null || deps.length > 0;
			r.update(EffectArguments, propsFor(nextDeps, 2));
			flushEffects();
			expect(r.find('span').textContent).toBe('2');
			for (const phase of phases) {
				expect(logs[phase]).toEqual(
					repeats
						? [
								['setup', 1, null, firstArgs],
								['cleanup', 1, firstArgs],
								['setup', 2, null, nextArgs],
							]
						: [['setup', 1, null, firstArgs]],
				);
			}

			r.unmount();
			flushEffects();
			for (const phase of phases) {
				expect(logs[phase]).toEqual(
					repeats
						? [
								['setup', 1, null, firstArgs],
								['cleanup', 1, firstArgs],
								['setup', 2, null, nextArgs],
								['cleanup', 2, nextArgs],
							]
						: [
								['setup', 1, null, firstArgs],
								['cleanup', 1, firstArgs],
							],
				);
			}
		});
	});
});
