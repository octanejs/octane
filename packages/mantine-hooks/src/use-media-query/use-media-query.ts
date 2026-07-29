import { useEffect, useState } from 'octane';

export interface UseMediaQueryOptions {
	getInitialValueInEffect: boolean;
}

function getInitialValue(query: string, initialValue?: boolean) {
	if (typeof initialValue === 'boolean') {
		return initialValue;
	}

	if (typeof window !== 'undefined' && 'matchMedia' in window) {
		return window.matchMedia(query).matches;
	}

	return false;
}

function withoutSlot<T>(value: T | symbol): T | undefined {
	return typeof value === 'symbol' ? undefined : value;
}

export function useMediaQuery(
	query: string,
	initialValue?: boolean,
	options: UseMediaQueryOptions = { getInitialValueInEffect: true },
): boolean {
	const normalizedInitialValue = withoutSlot(initialValue);
	const { getInitialValueInEffect } = withoutSlot(options) ?? { getInitialValueInEffect: true };
	const [matches, setMatches] = useState(
		getInitialValueInEffect
			? normalizedInitialValue
			: getInitialValue(query, normalizedInitialValue),
	);
	useEffect(() => {
		try {
			if ('matchMedia' in window) {
				const mediaQuery = window.matchMedia(query);
				setMatches(mediaQuery.matches);
				const callback = (event: MediaQueryListEvent) => setMatches(event.matches);
				mediaQuery.addEventListener('change', callback);
				return () => {
					mediaQuery.removeEventListener('change', callback);
				};
			}
		} catch (e) {
			// Safari iframe compatibility issue
			return undefined;
		}
	}, [query]);

	return matches || false;
}

export namespace useMediaQuery {
	export type Options = UseMediaQueryOptions;
}
