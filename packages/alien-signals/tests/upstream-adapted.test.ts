import { startTransition } from 'octane';
import { describe, expect, it, vi } from 'vitest';
import {
	batch,
	createComputed,
	createEffect,
	createSignal,
	createSignalScope,
	trigger,
} from '@octanejs/alien-signals';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { act, mount, nextPaint } from './_helpers';
import {
	BatchedReaders,
	ComputedChainReader,
	ComputedDualReader,
	ComputedObjectReader,
	ComputedOffsetReader,
	ComputedReader,
	ComputedReuseReader,
	DeferredReader,
	EffectAndSignal,
	EffectCounter,
	ManualStopScope,
	NullableSignalReader,
	ObjectSignalReader,
	PhasedSignalEffects,
	ScopeProbe,
	SelectorReader,
	SetterOnly,
	SignalTuple,
	SignalValueReader,
	StrictSignalValueReader,
	SubscriptionBundle,
} from './_fixtures/hooks.tsrx';

describe('Alien React Library', () => {
	// Per src/index.test.ts:40
	it('should create a writable signal', function shouldCreateAWritableSignal() {
		const mySignal = createSignal(0);
		expect(mySignal()).toBe(0);
		mySignal(10);
		expect(mySignal()).toBe(10);
	});

	// Per src/index.test.ts:48
	it('should create and update a computed signal', function shouldCreateAndUpdateAComputedSignal() {
		const countSignal = createSignal(1);
		const doubleSignal = createComputed(() => countSignal() * 2);
		expect(doubleSignal()).toBe(2);
		countSignal(2);
		expect(doubleSignal()).toBe(4);
		countSignal(3);
		expect(doubleSignal()).toBe(6);
	});

	// Per src/index.test.ts:65
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

	// Per src/index.test.ts:79
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

	// Per src/index.test.ts:96
	it('useSignal should return [value, setter]', async function useSignalShouldReturnValueSetter() {
		const countSignal = createSignal(0);
		const result = mount(SignalTuple, { source: countSignal });
		expect(result.find('#value').textContent).toBe('0');
		result.click('#set');
		await nextPaint();
		expect(result.find('#value').textContent).toBe('10');
		result.unmount();
	});

	// Per src/index.test.ts:106
	it('useSignalValue should return read-only value from a signal', async function useSignalValueShouldReturnReadOnlyValue() {
		const countSignal = createSignal(0);
		const result = mount(SignalValueReader, { source: countSignal });
		expect(result.find('#value').textContent).toBe('0');
		countSignal(5);
		await nextPaint();
		expect(result.find('#value').textContent).toBe('5');
		result.unmount();
	});

	// Per src/index.test.ts:115
	it('useSetSignal should return setter only', function useSetSignalShouldReturnSetterOnly() {
		const countSignal = createSignal(0);
		const result = mount(SetterOnly, { source: countSignal });
		result.click('#set');
		expect(countSignal()).toBe(10);
		result.click('#inc');
		expect(countSignal()).toBe(15);
		result.unmount();
	});

	// Per src/index.test.ts:131
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

	// Per src/index.test.ts:144
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

	// Per src/index.test.ts:150
	it('useComputed should return a computed value', async function useComputedShouldReturnAComputedValue() {
		const countSignal = createSignal(0);
		const result = mount(ComputedReader, { source: countSignal, multiplier: 2 });
		expect(result.find('#computed').textContent).toBe('0');
		countSignal(5);
		await nextPaint();
		expect(result.find('#computed').textContent).toBe('10');
		result.unmount();
	});

	// Per src/index.test.ts:164
	it('should handle nested signal updates correctly', function shouldHandleNestedSignalUpdatesCorrectly() {
		const outerSignal = createSignal(1);
		const innerSignal = createSignal(2);
		const computedSignal = createComputed(() => outerSignal() * innerSignal());
		expect(computedSignal()).toBe(2);
		outerSignal(2);
		innerSignal(3);
		expect(computedSignal()).toBe(6);
	});

	// Per src/index.test.ts:178
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

	// Per src/index.test.ts:194
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

	// Per src/index.test.ts:223
	it('useSignal should handle functional updates correctly', async function useSignalShouldHandleFunctionalUpdatesCorrectly() {
		const countSignal = createSignal(0);
		const result = mount(SignalTuple, { source: countSignal });
		result.click('#inc-twice');
		await nextPaint();
		expect(result.find('#value').textContent).toBe('2');
		result.unmount();
	});

	// Per src/index.test.ts:235
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

	// Per src/index.test.ts:256
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

	// Per src/index.test.ts:280
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

	// Per src/index.test.ts:305
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

	// Per src/index.test.ts:327
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

	// Per src/index.test.ts:350
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

	// Per src/index.test.ts:368
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

	// Per src/index.test.ts:394
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

	// Per src/index.test.ts:409
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

	// Per src/index.test.ts:430
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

	// Per src/index.test.ts:457
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

	// Per src/index.test.ts:485
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

	describe('Alien Signals 3 and React 19.2 integration', () => {
		// Per src/index.test.ts:511
		it('lets React automatically batch multiple signal notifications into one render', async function batchesSignalNotificationsIntoOneRender() {
			const first = createSignal(0);
			const second = createSignal(0);
			let renders = 0;
			const result = mount(BatchedReaders, {
				first,
				second,
				onRender: function onRender() {
					renders++;
				},
			});
			first(1);
			second(1);
			first(2);
			await nextPaint();
			expect(result.find('#values').textContent).toBe(JSON.stringify([2, 1]));
			expect(renders).toBe(2);
			result.unmount();
		});

		// Per src/index.test.ts:530
		it('batches multiple writes into one propagation', function batchesWritesIntoOnePropagation() {
			const first = createSignal(1);
			const second = createSignal(2);
			const snapshots: number[] = [];
			const stop = createEffect(function snapshot() {
				snapshots.push(first() + second());
			});
			batch(function writeBoth() {
				first(10);
				second(20);
			});
			expect(snapshots).toEqual([3, 30]);
			stop();
		});

		// Per src/index.test.ts:547
		it('manually triggers dependents after an in-place mutation', function triggersDependentsAfterMutation() {
			const items = createSignal<number[]>([]);
			const size = createComputed(() => items().length);
			expect(size()).toBe(0);
			items().push(1);
			expect(size()).toBe(0);
			trigger(items);
			expect(size()).toBe(1);
		});

		// Per src/index.test.ts:558
		it('shares a source safely across multiple React subscribers', async function sharesSourceAcrossSubscribers() {
			const count = createSignal(0);
			const first = mount(SignalValueReader, { source: count });
			const second = mount(SignalValueReader, { source: count });
			const third = mount(SignalValueReader, { source: count });

			count(1);
			await nextPaint();
			expect(first.container.textContent).toBe('1');
			expect(second.container.textContent).toBe('1');
			expect(third.container.textContent).toBe('1');

			second.unmount();
			count(2);
			await nextPaint();
			expect(first.container.textContent).toBe('2');
			expect(third.container.textContent).toBe('2');

			first.unmount();
			count(3);
			await nextPaint();
			expect(third.container.textContent).toBe('3');
			third.unmount();
		});

		// Per src/index.test.ts:580
		it('skips React renders when a selected signal slice is unchanged', async function skipsRendersForUnchangedSlice() {
			const state = createSignal({ selected: 1, unrelated: 1 });
			const select = function select(value: { selected: number; unrelated: number }) {
				return value.selected;
			};
			let renders = 0;
			const result = mount(SelectorReader, {
				source: state,
				select,
				onRender: function onRender() {
					renders++;
				},
			});

			state({ selected: 1, unrelated: 2 });
			await nextPaint();
			expect(result.find('#selected').textContent).toBe('1');
			expect(renders).toBe(1);

			state({ selected: 2, unrelated: 2 });
			await nextPaint();
			expect(result.find('#selected').textContent).toBe('2');
			expect(renders).toBe(2);
			result.unmount();
		});

		// Per src/index.test.ts:598
		it('does not create a signal scope during server rendering', async function doesNotCreateScopeOnServer() {
			const callback = vi.fn();
			await renderHydrationFixture(
				'alien-signals',
				'packages/alien-signals/tests/_fixtures/hooks.tsrx',
				'ServerScopeProbe',
				{ callback },
			);
			expect(callback).not.toHaveBeenCalled();
		}, 30_000);

		// Per src/index.test.ts:610
		it('keeps snapshots consistent when a signal write occurs in a transition', async function keepsSnapshotsConsistentInTransition() {
			const count = createSignal(0);
			const result = mount(StrictSignalValueReader, { source: count });
			startTransition(function writeInTransition() {
				count(1);
			});
			await nextPaint();
			expect(result.find('#value').textContent).toBe('1');
			result.unmount();
		});

		// Per src/index.test.ts:623
		it('offers a deferred snapshot without changing the source value', async function offersDeferredSnapshot() {
			const count = createSignal(0);
			const result = mount(DeferredReader, { source: count });
			count(1);
			await nextPaint();
			expect(result.find('#current').textContent).toBe('1');
			await act(() => {});
			expect(result.find('#deferred').textContent).toBe('1');
			result.unmount();
		});

		// Per src/index.test.ts:637
		it('runs insertion, layout, and passive signal effects in React order', async function runsSignalEffectsInPhaseOrder() {
			const order: string[] = [];
			const source = createSignal(0);
			const dependencies = [source] as const;
			const result = mount(PhasedSignalEffects, {
				dependencies,
				log: function log(entry: string) {
					order.push(entry);
				},
			});
			await nextPaint();
			expect(order).toEqual(['insertion', 'layout', 'passive']);

			source(1);
			await nextPaint();
			expect(order).toEqual(['insertion', 'layout', 'passive', 'insertion', 'layout', 'passive']);
			result.unmount();
		});

		// Per src/index.test.ts:667
		it('cleans a manually stopped React scope exactly once', async function cleansStoppedScopeOnce() {
			const source = createSignal(0);
			const cleanupEffect = vi.fn();
			let stop = function noop() {};
			const result = mount(ManualStopScope, {
				source,
				cleanupEffect,
				onStop: function onStop(nextStop: () => void) {
					stop = nextStop;
				},
			});
			await nextPaint();
			stop();
			expect(cleanupEffect).toHaveBeenCalledTimes(1);
			result.unmount();
			await nextPaint();
			expect(cleanupEffect).toHaveBeenCalledTimes(1);
		});
	});
});
