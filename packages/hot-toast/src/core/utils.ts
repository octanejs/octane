// Ported unchanged from react-hot-toast@2.6.1 src/core/utils.ts
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
export const genId = (() => {
	let count = 0;
	return () => {
		return (++count).toString();
	};
})();

export const prefersReducedMotion = (() => {
	// Cache result
	let shouldReduceMotion: boolean | undefined = undefined;

	return () => {
		if (shouldReduceMotion === undefined && typeof window !== 'undefined') {
			const mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
			shouldReduceMotion = !mediaQuery || mediaQuery.matches;
		}
		return shouldReduceMotion;
	};
})();
