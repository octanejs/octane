import { useCallback, useEffect, useRef } from 'octane';
import { withoutSlot } from '../internal';
import { useCallbackRef } from '../utils';

export interface UseTimeoutOptions {
	autoInvoke: boolean;
}

export interface UseTimeoutReturnValue {
	start: (...args: any[]) => void;
	clear: () => void;
}

export function useTimeout(
	callback: (...args: any[]) => void,
	delay: number,
	options: UseTimeoutOptions = { autoInvoke: false },
): UseTimeoutReturnValue {
	const normalizedOptions = withoutSlot(options) ?? { autoInvoke: false };
	const timeoutRef = useRef<number | null>(null);
	const handleCallback = useCallbackRef(callback);

	const start = useCallback(
		(...args: any[]) => {
			if (!timeoutRef.current) {
				timeoutRef.current = window.setTimeout(() => {
					handleCallback(...args);
					timeoutRef.current = null;
				}, delay);
			}
		},
		[delay],
	);

	const clear = useCallback(() => {
		if (timeoutRef.current) {
			window.clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	useEffect(() => {
		if (normalizedOptions.autoInvoke) {
			start();
		}

		return clear;
	}, [clear, start]);

	return { start, clear };
}

export namespace useTimeout {
	export type Options = UseTimeoutOptions;
	export type ReturnValue = UseTimeoutReturnValue;
}
