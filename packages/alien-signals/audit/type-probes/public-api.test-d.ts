import {
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
	type WritableSignal,
} from '../../upstream/src/index.ts';

declare function expectType<T>(value: T): void;

const count: WritableSignal<number> = createSignal(1);
const doubled = createComputed(function double() {
	return count() * 2;
});

count(2);
count(function increment(previous) {
	return previous + 1;
});
createEffect(function track() {
	count();
});
createSignalScope(function scoped() {
	createEffect(function track() {
		count();
	});
});

const tuple: [number, (value: number | ((previous: number) => number)) => void] = useSignal(count);
const value: number = useSignalValue(count);
const setValue = useSetSignal(count);
setValue(3);
setValue(function increment(previous) {
	return previous + 1;
});
useSignalEffect(function effect() {
	return function cleanup() {};
});
const stop: () => void = useSignalScope(function scoped() {
	createEffect(function track() {
		count();
	});
});
const computedValue: number = useComputed(function compute() {
	return count() * 3;
}, []);

expectType<typeof createSignal>(createSignal);
expectType<typeof useSignal>(useSignal);
void tuple;
void value;
void stop;
void computedValue;
void doubled;

// @ts-expect-error computed signals are read-only
doubled(3);
// @ts-expect-error setters must match the signal value type
setValue('3');
