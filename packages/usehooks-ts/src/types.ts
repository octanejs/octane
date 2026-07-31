export type SetStateAction<T> = T | ((previous: T) => T);
export type Dispatch<T> = (value: T) => void;

export interface ControlFunctions {
	cancel: () => void;
	flush: () => void;
	isPending: () => boolean;
}

export type DebouncedState<T extends (...args: any[]) => ReturnType<T>> = ((
	...args: Parameters<T>
) => ReturnType<T> | undefined) &
	ControlFunctions;

export interface DebounceOptions {
	leading?: boolean;
	trailing?: boolean;
	maxWait?: number;
}
