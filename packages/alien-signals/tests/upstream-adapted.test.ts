import { describe, expect, it, vi } from 'vitest';
import {
	createComputed,
	createEffect,
	createSignal,
	createSignalScope,
} from '@octanejs/alien-signals';
import { mount, nextPaint } from './_helpers';
import {
	ComputedChainReader,
	ComputedDualReader,
	ComputedObjectReader,
	ComputedOffsetReader,
	ComputedReader,
	ComputedReuseReader,
	EffectAndSignal,
	EffectCounter,
	NullableSignalReader,
	ObjectSignalReader,
	ScopeProbe,
	SetterOnly,
	SignalTuple,
	SignalValueReader,
	SubscriptionBundle,
} from './_fixtures/hooks.tsrx';

describe('Alien React Library', () => {
	// Per src/index.test.ts:31
	it('should create a writable signal', function shouldCreateAWritableSignal() {
		const mySignal = createSignal(0);
		expect(mySignal()).toBe(0);
		mySignal(10);
		expect(mySignal()).toBe(10);
	});

	// Per src/index.test.ts:39
	it('should create and update a computed signal', function shouldCreateAndUpdateAComputedSignal() {
		const countSignal = createSignal(1);
		const doubleSignal = createComputed(() => countSignal() * 2);
		expect(doubleSignal()).toBe(2);
		countSignal(2);
		expect(doubleSignal()).toBe(4);
		countSignal(3);
		expect(doubleSignal()).toBe(6);
	});

	// Per src/index.test.ts:56
	it('should create and run an effect', function shouldCreateAndRunAnEffect() {
		const countSignal = createSignal(1);
		let observed = 0;
		createEffect(function track() {
			observed = countSignal();
		});
		expect(observed).toBe(1);
		countSignal(2);
		expect(observed).toBe(2);
	});

	// Per src/index.test.ts:70
	it('should create a signal scope', function shouldCreateASignalScope() {
		let value = 0;
		const stopScope = createSignalScope(function scoped() {
			createEffect(function run() {
				value = 99;
			});
		});
		expect(stopScope).toBeDefined();
		expect(value).toBe(99);
		stopScope();
	});

	// Per src/index.test.ts:87
	it('useSignal should return [value, setter]', async function useSignalShouldReturnValueSetter() {
		const countSignal = createSignal(0);
		const result = mount(SignalTuple, { source: countSignal });
		expect(result.find('#value').textContent).toBe('0');
		result.click('#set');
		await nextPaint();
		expect(result.find('#value').textContent).toBe('10');
		result.unmount();
	});

	// Per src/index.test.ts:97
	it('useSignalValue should return read-only value from a signal', async function useSignalValueShouldReturnReadOnlyValue() {
		const countSignal = createSignal(0);
		const result = mount(SignalValueReader, { source: countSignal });
		expect(result.find('#value').textContent).toBe('0');
		countSignal(5);
		await nextPaint();
		expect(result.find('#value').textContent).toBe('5');
		result.unmount();
	});

	// Per src/index.test.ts:106
	it('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {
		const countSignal = createSignal(0);
		const result = mount(SetterOnly, { source: countSignal });
		result.click('#set');
		expect(countSignal()).toBe(10);
		result.click('#inc');
		expect(countSignal()).toBe(15);
		result.unmount();
	});

	// Per src/index.test.ts:122
	it('useSignalEffect should register an effect in React', async function useSignalEffectShouldRegisterAnEffect() {
		const countSignal = createSignal(0);
		const effectFn = vi.fn();
		const result = mount(EffectCounter, {
			source: countSignal,
			onEffect: effectFn,
		});
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(1);
		countSignal(5);
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(2);
		result.unmount();
	});

	// Per src/index.test.ts:135
	it('useSignalScope should create and manage an effect scope in React', async function useSignalScopeShouldCreateAndManageScope() {
		const source = createSignal(0);
		const entries: string[] = [];
		let stop: (() => void) | undefined;
		const result = mount(ScopeProbe, {
			source,
			label: 'scope',
			log: function log(entry: string) {
				entries.push(entry);
			},
			onStop: function onStop(nextStop: () => void) {
				stop = nextStop;
			},
		});
		await nextPaint();
		expect(stop).toBeDefined();
		expect(entries).toEqual(['scope:0']);
		result.unmount();
		await nextPaint();
		source(1);
		expect(
			entries.filter(function onlyOne(entry) {
				return entry.endsWith(':1');
			}),
		).toEqual([]);
	});

	// Per src/index.test.ts:141
	it('useComputed should return a computed value', async function useComputedShouldReturnAComputedValue() {
		const countSignal = createSignal(0);
		const result = mount(ComputedReader, { source: countSignal, multiplier: 2 });
		expect(result.find('#computed').textContent).toBe('0');
		countSignal(5);
		await nextPaint();
		expect(result.find('#computed').textContent).toBe('10');
		result.unmount();
	});

	// Per src/index.test.ts:155
	it('should handle nested signal updates correctly', function shouldHandleNestedSignalUpdatesCorrectly() {
		const outerSignal = createSignal(1);
		const innerSignal = createSignal(2);
		const computedSignal = createComputed(() => outerSignal() * innerSignal());
		expect(computedSignal()).toBe(2);
		outerSignal(2);
		innerSignal(3);
		expect(computedSignal()).toBe(6);
	});

	// Per src/index.test.ts:169
	it('should handle signal updates within effects', function shouldHandleSignalUpdatesWithinEffects() {
		const countSignal = createSignal(0);
		const doubleSignal = createSignal(0);
		createEffect(function writeDouble() {
			doubleSignal(countSignal() * 2);
		});
		expect(doubleSignal()).toBe(0);
		countSignal(5);
		expect(doubleSignal()).toBe(10);
	});

	// Per src/index.test.ts:185
	it('should properly cleanup effects when scope is stopped', function shouldProperlyCleanupEffectsWhenScopeIsStopped() {
		const countSignal = createSignal(0);
		let effectRuns = 0;
		const stopScope = createSignalScope(function scoped() {
			createEffect(function track() {
				countSignal();
				effectRuns++;
			});
		});
		expect(effectRuns).toBe(1);
		countSignal(1);
		expect(effectRuns).toBe(2);
		stopScope();
		countSignal(2);
		expect(effectRuns).toBe(2);
	});

	// Per src/index.test.ts:214
	it('useSignal should handle functional updates correctly', async function useSignalShouldHandleFunctionalUpdatesCorrectly() {
		const countSignal = createSignal(0);
		const result = mount(SignalTuple, { source: countSignal });
		result.click('#inc-twice');
		await nextPaint();
		expect(result.find('#value').textContent).toBe('2');
		result.unmount();
	});

	// Per src/index.test.ts:226
	it('useComputed should update when dependencies change', async function useComputedShouldUpdateWhenDependenciesChange() {
		const countSignal = createSignal(0);
		const multiplierSignal = createSignal(2);
		const result = mount(ComputedDualReader, {
			count: countSignal,
			multiplier: multiplierSignal,
		});
		expect(result.find('#computed').textContent).toBe('0');
		countSignal(5);
		await nextPaint();
		expect(result.find('#computed').textContent).toBe('10');
		multiplierSignal(3);
		await nextPaint();
		expect(result.find('#computed').textContent).toBe('15');
		result.unmount();
	});

	// Per src/index.test.ts:247
	it('useComputed should not enter a render loop after a dependency update', async function useComputedShouldNotEnterARenderLoop() {
		const countSignal = createSignal(0);
		let renders = 0;
		const result = mount(ComputedObjectReader, {
			source: countSignal,
			onRender: function onRender() {
				renders++;
				if (renders > 20) {
					throw new Error('Infinite render loop');
				}
			},
		});
		expect(result.find('#computed').textContent).toBe('0');
		countSignal(1);
		await nextPaint();
		expect(result.find('#computed').textContent).toBe('1');
		expect(renders).toBe(2);
		result.unmount();
	});

	// Per src/index.test.ts:271
	it('useComputed should reuse the computed across re-renders when deps are unchanged', async function useComputedShouldReuseComputedAcrossRerenders() {
		const sig = createSignal(1);
		let getterCalls = 0;
		const result = mount(ComputedReuseReader, {
			source: sig,
			onGetter: function onGetter() {
				getterCalls++;
			},
		});
		expect(result.find('#computed').textContent).toBe('2');
		const callsAfterMount = getterCalls;
		result.click('#rerender');
		result.click('#rerender');
		result.click('#rerender');
		await nextPaint();
		expect(getterCalls).toBe(callsAfterMount);
		expect(result.find('#computed').textContent).toBe('2');
		result.unmount();
	});

	// Per src/index.test.ts:296
	it('useComputed should rebuild the computed when deps change', async function useComputedShouldRebuildWhenDepsChange() {
		const sig = createSignal(1);
		let getterCalls = 0;
		const result = mount(ComputedOffsetReader, {
			source: sig,
			offset: 10,
			onGetter: function onGetter() {
				getterCalls++;
			},
		});
		expect(result.find('#computed').textContent).toBe('11');
		const callsAfterFirst = getterCalls;
		result.update(ComputedOffsetReader, {
			source: sig,
			offset: 20,
			onGetter: function onGetter() {
				getterCalls++;
			},
		});
		await nextPaint();
		expect(result.find('#computed').textContent).toBe('21');
		expect(getterCalls).toBeGreaterThan(callsAfterFirst);
		result.unmount();
	});

	// Per src/index.test.ts:318
	it('useSignalEffect should handle cleanup correctly', async function useSignalEffectShouldHandleCleanupCorrectly() {
		const countSignal = createSignal(0);
		const cleanupFn = vi.fn();
		const result = mount(EffectCounter, {
			source: countSignal,
			onEffect: function onEffect() {},
			onCleanup: cleanupFn,
		});
		await nextPaint();
		countSignal(1);
		await nextPaint();
		expect(cleanupFn).toHaveBeenCalledTimes(1);
		result.unmount();
		await nextPaint();
		expect(cleanupFn).toHaveBeenCalledTimes(2);
	});

	// Per src/index.test.ts:341
	it('should handle signal updates correctly', async function shouldHandleSignalUpdatesCorrectly() {
		const signal = createSignal({ a: 1, b: 2 });
		const result = mount(ObjectSignalReader, { source: signal });
		expect(result.find('#value').textContent).toBe(JSON.stringify({ a: 1, b: 2 }));
		result.click('#set');
		await nextPaint();
		expect(signal()).toEqual({ a: 2, b: 2 });
		expect(result.find('#value').textContent).toBe(JSON.stringify({ a: 2, b: 2 }));
		result.unmount();
	});

	// Per src/index.test.ts:359
	it('should handle multiple signal updates', async function shouldHandleMultipleSignalUpdates() {
		const signal = createSignal(0);
		const effectFn = vi.fn();
		const result = mount(EffectCounter, {
			source: signal,
			onEffect: effectFn,
		});
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(1);
		signal(1);
		signal(2);
		signal(3);
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(4);
		result.unmount();
	});

	// Per src/index.test.ts:385
	it('should handle undefined/null signal values', async function shouldHandleUndefinedNullSignalValues() {
		const signal = createSignal<number | undefined | null>(123);
		const result = mount(NullableSignalReader, { source: signal });
		result.click('#undef');
		await nextPaint();
		expect(result.find('#value').textContent).toBe('undefined');
		result.click('#null');
		await nextPaint();
		expect(result.find('#value').textContent).toBe('null');
		result.unmount();
	});

	// Per src/index.test.ts:401
	it('should handle computed dependencies correctly', async function shouldHandleComputedDependenciesCorrectly() {
		const a = createSignal(1);
		const b = createSignal(2);
		const computedA = createComputed(() => b() + 1);
		const computedB = createComputed(() => a() + 1);
		const result = mount(ComputedChainReader, { left: computedA, right: computedB });
		expect(result.find('#computed').textContent).toBe('5');
		a(2);
		await nextPaint();
		expect(result.find('#computed').textContent).toBe('6');
		result.unmount();
	});

	// Per src/index.test.ts:422
	it('should cleanup all subscriptions on unmount', async function shouldCleanupAllSubscriptionsOnUnmount() {
		const signal = createSignal(0);
		const effectFn = vi.fn();
		const result = mount(SubscriptionBundle, {
			source: signal,
			onEffect: effectFn,
		});
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(1);
		result.unmount();
		await nextPaint();
		signal(5);
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(1);
	});

	// Per src/index.test.ts:449
	it('should handle multiple mount/unmount cycles', async function shouldHandleMultipleMountUnmountCycles() {
		const signal = createSignal(0);
		const effectFn = vi.fn();
		function mountOnce() {
			return mount(EffectCounter, {
				source: signal,
				onEffect: effectFn,
			});
		}
		const hook1 = mountOnce();
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(1);
		hook1.unmount();
		await nextPaint();
		const hook2 = mountOnce();
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(2);
		hook2.unmount();
		await nextPaint();
		expect(effectFn).toHaveBeenCalledTimes(2);
	});

	// Per src/index.test.ts:477
	it('should handle concurrent updates correctly', async function shouldHandleConcurrentUpdatesCorrectly() {
		const signal = createSignal(0);
		const effectFn = vi.fn();
		const setters: Array<(value: number | ((previous: number) => number)) => void> = [];
		const record = function recordSetter(
			setter: (value: number | ((previous: number) => number)) => void,
		) {
			setters.push(setter);
		};
		// Upstream schedules result.current[1] (the useSignal setter). Capture that
		// setter via the SetterProbe-style record callback so a no-op setter fails.
		const result = mount(EffectAndSignal, {
			source: signal,
			onEffect: effectFn,
			record,
		});
		await nextPaint();
		const setValue = setters.at(-1);
		expect(setValue).toBeTypeOf('function');
		// Same microtask-stratum concurrent writes as upstream's
		// Promise.all([Promise.resolve().then(setter)...]) inside async act.
		await Promise.all([
			Promise.resolve().then(function setOne() {
				setValue?.(1);
			}),
			Promise.resolve().then(function setTwo() {
				setValue?.(2);
			}),
			Promise.resolve().then(function setThree() {
				setValue?.(3);
			}),
			Promise.resolve().then(function setFour() {
				setValue?.(4);
			}),
		]);
		await nextPaint();
		expect(signal()).toBe(4);
		result.unmount();
	});
});
