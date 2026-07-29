import { useCallback, useState } from 'octane';
import { clamp } from '../utils';

const DEFAULT_OPTIONS = {
	min: -Infinity,
	max: Infinity,
};

export interface UseCounterOptions {
	min?: number;
	max?: number;
	step?: number;
}

export interface UseCounterHandlers {
	increment: () => void;
	decrement: () => void;
	set: (value: number) => void;
	reset: () => void;
}

export type UseCounterReturnValue = [number, UseCounterHandlers];

function withoutSlot<T>(value: T | symbol): T | undefined {
	return typeof value === 'symbol' ? undefined : value;
}

export function useCounter(initialValue = 0, options?: UseCounterOptions): UseCounterReturnValue {
	const normalizedInitialValue = withoutSlot(initialValue) ?? 0;
	const normalizedOptions = withoutSlot(options);
	const { min, max, step: _step = 1 } = { ...DEFAULT_OPTIONS, ...normalizedOptions };
	const step = Math.abs(_step);
	const [count, setCount] = useState<number>(clamp(normalizedInitialValue, min, max));

	const increment = useCallback(
		() => setCount((current) => clamp(current + step, min, max)),
		[min, max, step],
	);

	const decrement = useCallback(
		() => setCount((current) => clamp(current - step, min, max)),
		[min, max, step],
	);

	const set = useCallback((value: number) => setCount(clamp(value, min, max)), [min, max]);

	const reset = useCallback(
		() => setCount(clamp(normalizedInitialValue, min, max)),
		[normalizedInitialValue, min, max],
	);

	return [count, { increment, decrement, set, reset }];
}

export namespace useCounter {
	export type Options = UseCounterOptions;
	export type Handlers = UseCounterHandlers;
	export type ReturnValue = UseCounterReturnValue;
}
