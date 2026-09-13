import type { DependencyList } from 'react';
import { useEffect, useRef } from 'octane';

function dependenciesChanged(previous: DependencyList, next: DependencyList) {
	return (
		previous.length !== next.length || next.some((dep, index) => !Object.is(dep, previous[index]))
	);
}

export function useDidUpdate(fn: () => void | (() => void), dependencies?: DependencyList) {
	const normalizedDependencies = typeof dependencies === 'symbol' ? undefined : dependencies;
	const mounted = useRef(false);
	const previousRender = useRef<object | null>(null);
	const previousDependencies = useRef<DependencyList | undefined>(undefined);
	const render = {};

	useEffect(
		() => {
			const isSameRender = previousRender.current === render;
			const previous = previousDependencies.current;

			previousRender.current = render;
			previousDependencies.current = normalizedDependencies;

			if (!mounted.current) {
				mounted.current = true;
				return undefined;
			}

			if (isSameRender) {
				return undefined;
			}

			if (
				normalizedDependencies &&
				previous &&
				!dependenciesChanged(previous, normalizedDependencies)
			) {
				return undefined;
			}

			return fn();
		},
		normalizedDependencies ? [...normalizedDependencies] : null,
	);
}
