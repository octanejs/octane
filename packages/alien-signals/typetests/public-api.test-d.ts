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
	type ReadableSignal,
	type SignalEffectCallback,
	type SignalEffectDependencies,
	type SignalSetter,
	type WritableSignal,
} from '@octanejs/alien-signals';

declare function expectType<T>(value: T): void;

const count: WritableSignal<number> = createSignal(1);
const doubled: ReadableSignal<number> = createComputed(function double() {
	return count() * 2;
});
const history = createComputed(function accumulate(previous?: number[]) {
	return [...(previous ?? []), count()];
});

count(2);
createEffect(function track() {
	count();
});
const effectWithCleanup: SignalEffectCallback = function effect() {
	return function cleanup() {};
};
const stopEffect: () => void = createEffect(effectWithCleanup);
createSignalScope(function scoped() {
	createEffect(function track() {
		count();
	});
});
const batched: number = batch(function writeTwice() {
	count(3);
	count(4);
	return count();
});
trigger(count);

const tuple: [number, SignalSetter<number>] = useSignal(count);
const value: number = useSignalValue(count);
const readable: number = useSignalValue(doubled);
const deferred: number = useDeferredSignalValue(doubled);
const even: boolean = useSignalSelector(count, function isEven(next) {
	return next % 2 === 0;
});
const setValue = useSetSignal(count);
setValue(3);
setValue(function increment(previous) {
	return previous + 1;
});
useSignalEffect(function effect() {
	return function cleanup() {};
});
useSignalEffect(
	function effect() {
		count();
	},
	[count],
);
const dependencies: SignalEffectDependencies = [count, doubled];
useSignalPassiveEffect(dependencies, function passive() {});
useSignalLayoutEffect(
	dependencies,
	function layout() {
		return function cleanup() {};
	},
	[value],
);
useSignalInsertionEffect(dependencies, function insertion() {});
const stop: () => void = useSignalScope(function scoped() {
	createEffect(function track() {
		count();
	});
});
const stopWithDependencies: () => void = useSignalScope(function scoped() {}, []);
const computedValue: number = useComputed(function compute() {
	return count() * 3;
}, []);

expectType<typeof createSignal>(createSignal);
expectType<typeof useSignal>(useSignal);
expectType<number[]>(history());
void stopEffect;
void batched;
void tuple;
void value;
void readable;
void deferred;
void even;
void stop;
void stopWithDependencies;
void computedValue;

// @ts-expect-error computed signals are read-only
doubled(3);
// @ts-expect-error setters must match the signal value type
setValue('3');
// @ts-expect-error writable signals take values; only hook setters take updaters
count(function increment(previous: number) {
	return previous + 1;
});
// @ts-expect-error signal effect dependencies must be readable signals
useSignalPassiveEffect([1], function passive() {});
// @ts-expect-error useComputed requires a dependency list
useComputed(function compute() {
	return count();
});
