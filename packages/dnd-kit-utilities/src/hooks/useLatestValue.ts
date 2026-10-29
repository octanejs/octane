import { useRef } from 'octane';
import type { DependencyList } from 'octane';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export function useLatestValue<T extends any>(value: T, dependencies: DependencyList = [value]) {
	const valueRef = useRef<T>(value);

	useIsomorphicLayoutEffect(() => {
		if (valueRef.current !== value) {
			valueRef.current = value;
		}
	}, dependencies);

	return valueRef;
}
