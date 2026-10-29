import { useCallback, useRef } from 'octane';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export function useEvent<T extends Function>(handler: T | undefined) {
	const handlerRef = useRef<T | undefined>(handler);

	useIsomorphicLayoutEffect(() => {
		handlerRef.current = handler;
	});

	return useCallback(function (...args: any) {
		return handlerRef.current?.(...args);
	}, []);
}
