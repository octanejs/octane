/**
 * Adapted counterpart of the upstream typecheck program
 * (`upstream/src/index.test.ts` under `upstream/tsconfig.json`).
 *
 * Pins every accepted public-API call occurrence from the upstream type suite
 *   (multiset: duplicate shapes in distinct scenarios remain distinct)
 *
 * One helper per upstream scenario keeps local bindings so conflicting
 * top-level types are avoided while the mechanical accepted-call inventory
 * stays one-for-one by occurrence.
 */

import {
	batch,
	trigger,
	useDeferredSignalValue,
	useSignalSelector,
	useSignalInsertionEffect,
	useSignalLayoutEffect,
	useSignalPassiveEffect,
	createComputed,
	createEffect,
	createSignal,
	createSignalScope,
	useComputed,
	useSetSignal,
	useSignal,
	useSignalEffect,
	useSignalScope,
	useSignalValue,
} from '@octanejs/alien-signals';

function shouldCreateAWritableSignal() {
	createSignal(0);
}

function shouldCreateAndUpdateAComputedSignal() {
	const countSignal = createSignal(1);
	createComputed(() => countSignal() * 2);
}

function shouldCreateAndRunAnEffect() {
	const countSignal = createSignal(1);
	let observed = 0;
	createEffect(() => {
		observed = countSignal();
	});
}

function shouldCreateASignalScope() {
	let value = 0;
	createSignalScope(() => {
		createEffect(() => {
			value = 99;
		});
	});
}

function useSignalShouldReturnValueSetter() {
	const countSignal = createSignal(0);
	useSignal(countSignal);
}

function useSignalValueShouldReturnReadOnlyValue() {
	const countSignal = createSignal(0);
	useSignalValue(countSignal);
}

function useSetSignalShouldReturnSetterOnly() {
	const countSignal = createSignal(0);
	useSetSignal(countSignal);
}

function useSignalEffectShouldRegisterAnEffect() {
	const countSignal = createSignal(0);
	const effectFn = function effect() {
		countSignal();
	};
	useSignalEffect(effectFn);
}

function useSignalScopeShouldCreateAndManageScope() {
	useSignalScope(() => {});
}

function useComputedShouldReturnAComputedValue() {
	const countSignal = createSignal(0);
	useComputed(() => countSignal() * 2, []);
}

function shouldHandleNestedSignalUpdatesCorrectly() {
	const outerSignal = createSignal(1);
	const innerSignal = createSignal(2);
	createComputed(() => outerSignal() * innerSignal());
}

function shouldHandleSignalUpdatesWithinEffects() {
	const countSignal = createSignal(0);
	const doubleSignal = createSignal(0);
	createEffect(() => {
		doubleSignal(countSignal() * 2);
	});
}

function shouldProperlyCleanupEffectsWhenScopeIsStopped() {
	const countSignal = createSignal(0);
	let effectRuns = 0;
	createSignalScope(() => {
		createEffect(() => {
			countSignal();
			effectRuns++;
		});
	});
}

function useSignalShouldHandleFunctionalUpdates() {
	const countSignal = createSignal(0);
	useSignal(countSignal);
}

function useComputedShouldUpdateWhenDependenciesChange() {
	const countSignal = createSignal(0);
	const multiplierSignal = createSignal(2);
	useComputed(() => countSignal() * multiplierSignal(), []);
}

function useComputedShouldNotEnterARenderLoop() {
	const countSignal = createSignal(0);
	useComputed(() => ({ count: countSignal() }), []);
}

function useComputedShouldReuseAcrossRerenders() {
	const sig = createSignal(1);
	let getterCalls = 0;
	useComputed(() => {
		getterCalls++;
		return sig() * 2;
	}, []);
}

function useComputedShouldRebuildWhenDepsChange() {
	const sig = createSignal(1);
	let getterCalls = 0;
	let offset = 0;
	useComputed(() => {
		getterCalls++;
		return sig() + offset;
	}, [offset]);
}

function useSignalEffectShouldHandleCleanup() {
	const countSignal = createSignal(0);
	const cleanupFn = function cleanup() {};
	useSignalEffect(() => {
		countSignal();
		return cleanupFn;
	});
}

function shouldHandleSignalUpdatesCorrectly() {
	const signal = createSignal({ a: 1, b: 2 });
	useSignal(signal);
}

function shouldHandleMultipleSignalUpdates() {
	const signal = createSignal(0);
	const effectFn = function effect() {};
	useSignalEffect(() => {
		signal();
		effectFn();
	});
}

function shouldHandleUndefinedNullSignalValues() {
	const signal = createSignal<number | undefined | null>(123);
	const result = {
		current: useSignal(signal),
	};

	void result.current[0];
}

function shouldHandleComputedDependenciesCorrectly() {
	const a = createSignal(1);
	const b = createSignal(2);
	const computedA = createComputed(() => b() + 1);
	const computedB = createComputed(() => a() + 1);
	useComputed(() => computedA() + computedB(), []);
}

function shouldCleanupAllSubscriptionsOnUnmount() {
	const signal = createSignal(0);
	const effectFn = function effect() {};
	useSignal(signal);
	useComputed(() => signal() * 2, []);
	useSignalEffect(() => {
		signal();
		effectFn();
	});
}

function shouldHandleMultipleMountUnmountCycles() {
	const signal = createSignal(0);
	const effectFn = function effect() {};
	useSignalEffect(() => {
		signal();
		effectFn();
	});
}

function shouldHandleConcurrentUpdatesCorrectly() {
	const signal = createSignal(0);
	const effectFn = function effect() {};
	useSignalEffect(() => {
		signal();
		effectFn();
	});
	useSignal(signal);
}

shouldCreateAWritableSignal();
shouldCreateAndUpdateAComputedSignal();
shouldCreateAndRunAnEffect();
shouldCreateASignalScope();
useSignalShouldReturnValueSetter();
useSignalValueShouldReturnReadOnlyValue();
useSetSignalShouldReturnSetterOnly();
useSignalEffectShouldRegisterAnEffect();
useSignalScopeShouldCreateAndManageScope();
useComputedShouldReturnAComputedValue();
shouldHandleNestedSignalUpdatesCorrectly();
shouldHandleSignalUpdatesWithinEffects();
shouldProperlyCleanupEffectsWhenScopeIsStopped();
useSignalShouldHandleFunctionalUpdates();
useComputedShouldUpdateWhenDependenciesChange();
useComputedShouldNotEnterARenderLoop();
useComputedShouldReuseAcrossRerenders();
useComputedShouldRebuildWhenDepsChange();
useSignalEffectShouldHandleCleanup();
shouldHandleSignalUpdatesCorrectly();
shouldHandleMultipleSignalUpdates();
shouldHandleUndefinedNullSignalValues();
shouldHandleComputedDependenciesCorrectly();
shouldCleanupAllSubscriptionsOnUnmount();
shouldHandleMultipleMountUnmountCycles();
shouldHandleConcurrentUpdatesCorrectly();

function automaticBatching() {
	const first = createSignal(0);
	const second = createSignal(0);
	useSignalValue(first);
	useSignalValue(second);
}

function propagationBatching() {
	const first = createSignal(1);
	const second = createSignal(2);
	const snapshots: number[] = [];
	createEffect(() => {
		snapshots.push(first() + second());
	});
	batch(() => {
		first(10);
		second(20);
	});
}

function manualInvalidation() {
	const items = createSignal<number[]>([]);
	createComputed(() => items().length);
	trigger(items);
}

function sharedSubscribers() {
	const count = createSignal(0);
	useSignalValue(count);
	useSignalValue(count);
	useSignalValue(count);
}

function selectedSnapshot() {
	const state = createSignal({ selected: 1, unrelated: 1 });
	const select = (value: { selected: number; unrelated: number }) => value.selected;
	useSignalSelector(state, select);
}

function serverScope() {
	const callback = () => {};
	useSignalScope(callback, []);
}

function transitionSnapshot() {
	const count = createSignal(0);
	useSignalValue(count);
}

function deferredSnapshot() {
	const count = createSignal(0);
	useSignalValue(count);
	useDeferredSignalValue(count);
}

function phasedEffects() {
	const order: string[] = [];
	const source = createSignal(0);
	const dependencies = [source] as const;
	useSignalInsertionEffect(dependencies, () => {
		order.push('insertion');
	});
	useSignalLayoutEffect(dependencies, () => {
		order.push('layout');
	});
	useSignalPassiveEffect(dependencies, () => {
		order.push('passive');
	});
}

function scopeCleanup() {
	const source = createSignal(0);
	const cleanupEffect = () => {};
	useSignalScope(() => {
		createEffect(() => {
			source();
			return cleanupEffect;
		});
	}, []);
}
