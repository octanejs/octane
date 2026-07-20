import * as React from 'react';

/**
 * Hook that returns the user's preference for reduced motion.
 * @returns null if the value is not yet determined or the user's preference for reduced motion.
 */
export const usePrefersReducedMotion = () => {
	const [prefersReducedMotion, setPrefersReducedMotion] = React.useState<boolean | null>(null);

	React.useEffect(() => {
		const mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
		setPrefersReducedMotion(mediaQueryList.matches);

		const listener = (event: MediaQueryListEvent) => {
			setPrefersReducedMotion(event.matches);
		};

		mediaQueryList.addEventListener('change', listener);
		return () => {
			mediaQueryList.removeEventListener('change', listener);
		};
	}, []);

	return prefersReducedMotion;
};
