/**
 * Adapted counterpart of the upstream typecheck program
 * (`upstream/src/index.test.ts` under `upstream/tsconfig.json`).
 *
 * The pinned suite carries no `@ts-expect-error` groups, so this file pins
 * every accepted public-API call occurrence from it (multiset: duplicate shapes
 * in distinct scenarios remain distinct) and must not add a negative group.
 *
 * One helper per upstream scenario keeps local bindings so conflicting
 * top-level types are avoided while the mechanical accepted-call inventory
 * stays one-for-one by occurrence.
 */

import {
	batch,
	createComputed,
	createEffect,
	createSignal,
	createSignalScope,
	trigger,
	useComputed,
	useDeferredSignalValue,
	useSetSignal,
	useSignal,
	useSignalEffect,
	useSignalInsertionEffect,
	useSignalLayoutEffect,
	useSignalPassiveEffect,
	useSignalScope,
	useSignalSelector,
	useSignalValue,
} from '@octanejs/alien-signals';

function shouldCreateAWritableSignal() {
	const mySignal = createSignal(0);
	mySignal(10);
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

function useSignalShouldHandleFunctionalUpdatesCorrectly() {
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

function useComputedShouldReuseComputedAcrossRerenders() {
	const sig = createSignal(1);
	let getterCalls = 0;
	useComputed(() => {
		getterCalls++;
		return sig() * 2;
	}, []);
}

function useComputedShouldRebuildWhenDepsChange(offset: number) {
	const sig = createSignal(1);
	let getterCalls = 0;
	useComputed(() => {
		getterCalls++;
		return sig() + offset;
	}, [offset]);
}

function useSignalEffectShouldHandleCleanupCorrectly() {
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
	useSignal(signal);
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
	function mount() {
		useSignalEffect(() => {
			signal();
			effectFn();
		});
	}
	mount();
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

function batchesSignalNotificationsIntoOneRender() {
	const first = createSignal(0);
	const second = createSignal(0);
	useSignalValue(first);
	useSignalValue(second);
}

function batchesWritesIntoOnePropagation() {
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

function triggersDependentsAfterMutation() {
	const items = createSignal<number[]>([]);
	createComputed(() => items().length);
	trigger(items);
}

function sharesSourceAcrossSubscribers() {
	const count = createSignal(0);
	useSignalValue(count);
	useSignalValue(count);
	useSignalValue(count);
}

function skipsRendersForUnchangedSlice() {
	const state = createSignal({ selected: 1, unrelated: 1 });
	const select = (value: { selected: number; unrelated: number }) => value.selected;
	useSignalSelector(state, select);
}

function doesNotCreateScopeOnServer() {
	const callback = function callback() {};
	useSignalScope(callback, []);
}

function keepsSnapshotsConsistentInTransition() {
	const count = createSignal(0);
	useSignalValue(count);
}

function offersDeferredSnapshot() {
	const count = createSignal(0);
	useSignalValue(count);
	useDeferredSignalValue(count);
}

function runsSignalEffectsInPhaseOrder() {
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

function cleansStoppedScopeOnce() {
	const source = createSignal(0);
	const cleanupEffect = function cleanup() {};
	useSignalScope(() => {
		createEffect(() => {
			source();
			return cleanupEffect;
		});
	}, []);
}
