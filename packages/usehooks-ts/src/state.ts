import { useCallback, useState } from 'octane';
import { splitSlot, subSlot } from './internal';
import type { Dispatch, SetStateAction } from './types';

export interface UseBooleanReturn {
	value: boolean;
	setValue: Dispatch<SetStateAction<boolean>>;
	setTrue: () => void;
	setFalse: () => void;
	toggle: () => void;
}

export function useBoolean(...runtime: [defaultValue?: boolean, slot?: symbol]): UseBooleanReturn {
	const { args: rawArgs, slot } = splitSlot(runtime);
	const args = rawArgs as [defaultValue?: boolean];
	const defaultValue = args[0] ?? false;
	if (typeof defaultValue !== 'boolean') throw new Error('defaultValue must be `true` or `false`');
	const [value, setValue] = useState(defaultValue, subSlot(slot, 'state'));
	const setTrue = useCallback(() => setValue(true), [], subSlot(slot, 'true'));
	const setFalse = useCallback(() => setValue(false), [], subSlot(slot, 'false'));
	const toggle = useCallback(() => setValue((x: boolean) => !x), [], subSlot(slot, 'toggle'));
	return { value, setValue, setTrue, setFalse, toggle };
}

export interface UseCounterReturn {
	count: number;
	increment: () => void;
	decrement: () => void;
	reset: () => void;
	setCount: Dispatch<SetStateAction<number>>;
}

export function useCounter(...runtime: [initialValue?: number, slot?: symbol]): UseCounterReturn {
	const { args: rawArgs, slot } = splitSlot(runtime);
	const args = rawArgs as [initialValue?: number];
	const initialValue = args[0];
	const [count, setCount] = useState(initialValue ?? 0, subSlot(slot, 'state'));
	const increment = useCallback(() => setCount((x: number) => x + 1), [], subSlot(slot, 'inc'));
	const decrement = useCallback(() => setCount((x: number) => x - 1), [], subSlot(slot, 'dec'));
	const reset = useCallback(
		() => setCount(initialValue ?? 0),
		[initialValue],
		subSlot(slot, 'reset'),
	);
	return { count, increment, decrement, reset, setCount };
}

export function useToggle(
	...runtime: [defaultValue?: boolean, slot?: symbol]
): [boolean, () => void, Dispatch<SetStateAction<boolean>>] {
	const { args: rawArgs, slot } = splitSlot(runtime);
	const args = rawArgs as [defaultValue?: boolean];
	const [value, setValue] = useState(!!args[0], subSlot(slot, 'state'));
	const toggle = useCallback(() => setValue((x: boolean) => !x), [], subSlot(slot, 'toggle'));
	return [value, toggle, setValue];
}

export interface Actions<K, V> {
	set: (key: K, value: V) => void;
	setAll: (entries: Iterable<readonly [K, V]>) => void;
	remove: (key: K) => void;
	reset: () => void;
}

export function useMap<K, V>(
	...runtime: [initialState?: Map<K, V> | Iterable<readonly [K, V]>, slot?: symbol]
): [Omit<Map<K, V>, 'set' | 'clear' | 'delete'>, Actions<K, V>] {
	const { args: rawArgs, slot } = splitSlot(runtime);
	const args = rawArgs as [initialState?: Map<K, V> | Iterable<readonly [K, V]>];
	const [map, setMap] = useState<Map<K, V>>(() => new Map(args[0]), subSlot(slot, 'state'));
	const actions: Actions<K, V> = {
		set: useCallback(
			(key: K, value: V) => setMap((prev: Map<K, V>) => new Map(prev).set(key, value)),
			[],
			subSlot(slot, 'set'),
		),
		setAll: useCallback(
			(entries: Iterable<readonly [K, V]>) => setMap(new Map(entries)),
			[],
			subSlot(slot, 'all'),
		),
		remove: useCallback(
			(key: K) =>
				setMap((prev: Map<K, V>) => {
					const copy = new Map(prev);
					copy.delete(key);
					return copy;
				}),
			[],
			subSlot(slot, 'remove'),
		),
		reset: useCallback(() => setMap(new Map()), [], subSlot(slot, 'reset')),
	};
	return [map, actions];
}

export interface UseStepActions {
	goToNextStep: () => void;
	goToPrevStep: () => void;
	canGoToNextStep: boolean;
	canGoToPrevStep: boolean;
	setStep: Dispatch<SetStateAction<number>>;
	reset: () => void;
}

export function useStep(...runtime: [maxStep: number, slot?: symbol]): [number, UseStepActions] {
	const { args: rawArgs, slot } = splitSlot(runtime);
	const args = rawArgs as [number];
	const maxStep = args[0]!;
	const [currentStep, setCurrentStep] = useState(1, subSlot(slot, 'state'));
	const canGoToNextStep = currentStep + 1 <= maxStep;
	const canGoToPrevStep = currentStep - 1 > 0;
	const setStep = useCallback(
		(step: SetStateAction<number>) => {
			setCurrentStep((current: number) => {
				const next = typeof step === 'function' ? step(current) : step;
				if (next < 1 || next > maxStep) throw new Error('Step not valid');
				return next;
			});
		},
		[maxStep],
		subSlot(slot, 'set'),
	);
	const goToNextStep = useCallback(
		() => setCurrentStep((step: number) => (step < maxStep ? step + 1 : step)),
		[maxStep],
		subSlot(slot, 'next'),
	);
	const goToPrevStep = useCallback(
		() => setCurrentStep((step: number) => (step > 1 ? step - 1 : step)),
		[],
		subSlot(slot, 'prev'),
	);
	const reset = useCallback(() => setCurrentStep(1), [], subSlot(slot, 'reset'));
	return [
		currentStep,
		{ goToNextStep, goToPrevStep, canGoToNextStep, canGoToPrevStep, setStep, reset },
	];
}
