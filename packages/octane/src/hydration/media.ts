import type { HydrationPrefetchStrategy } from './types.js';

const mediaType = 'media';

/* @__NO_SIDE_EFFECTS__ */
export function media(query: string): HydrationPrefetchStrategy<typeof mediaType> {
	return {
		_t: mediaType,
		_s: ({ gate, prefetch }) => {
			if (!query) return;
			const callback = prefetch ?? gate?.resolve;
			if (!callback) return;

			const mediaQuery = window.matchMedia(query);
			if (mediaQuery.matches) {
				callback();
				return;
			}

			const onChange = () => {
				if (mediaQuery.matches) callback();
			};
			if (typeof mediaQuery.addEventListener === 'function') {
				mediaQuery.addEventListener('change', onChange);
				return () => mediaQuery.removeEventListener('change', onChange);
			}
			if (typeof mediaQuery.addListener === 'function') {
				mediaQuery.addListener(onChange);
				return () => mediaQuery.removeListener(onChange);
			}

			callback();
		},
	};
}
