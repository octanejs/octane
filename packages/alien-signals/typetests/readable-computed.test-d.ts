import {
	createComputed,
	createSignal,
	useSignalValue,
	type WritableSignal,
} from '@octanejs/alien-signals';

declare function expectType<T>(value: T): void;

const count: WritableSignal<number> = createSignal(1);
const doubled = createComputed(function double() {
	return count() * 2;
});

// Octane-only type contract: useSignalValue accepts readable computed signals.
const value: number = useSignalValue(doubled);
expectType<number>(value);
void value;
void doubled;

// @ts-expect-error computed signals remain read-only
doubled(3);
