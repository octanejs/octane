import { useRef } from 'octane';

export function useEventCallback<T>(handler?: (value: T) => void): (value: T) => void {
	const resolvedHandler =
		typeof handler === 'symbol' ? undefined : handler;
	const callbackRef = useRef(resolvedHandler);
	const fn = useRef(function (value: T) {
		callbackRef.current?.(value);
	});
	callbackRef.current = resolvedHandler;
	return fn.current;
}
