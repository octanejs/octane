import { router, VisitOptions } from '@inertiajs/core';
import { useEffect, useState } from 'octane';

const lastUpdatedAtSlot = Symbol('Inertia.usePrefetch.lastUpdatedAt');
const isPrefetchingSlot = Symbol('Inertia.usePrefetch.isPrefetching');
const isPrefetchedSlot = Symbol('Inertia.usePrefetch.isPrefetched');
const effectSlot = Symbol('Inertia.usePrefetch.effect');

export default function usePrefetch(options: VisitOptions | symbol = {}): {
	lastUpdatedAt: number | null;
	isPrefetching: boolean;
	isPrefetched: boolean;
	flush: () => void;
} {
	options = typeof options === 'symbol' ? {} : options;
	const cached =
		typeof window === 'undefined' ? null : router.getCached(window.location.pathname, options);
	const inFlight =
		typeof window === 'undefined' ? null : router.getPrefetching(window.location.pathname, options);

	const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(
		cached?.staleTimestamp || null,
		lastUpdatedAtSlot,
	);
	const [isPrefetching, setIsPrefetching] = useState(inFlight !== null, isPrefetchingSlot);
	const [isPrefetched, setIsPrefetched] = useState(cached !== null, isPrefetchedSlot);

	useEffect(
		() => {
			const onPrefetchingListener = router.on('prefetching', (e) => {
				if (e.detail.visit.url.pathname === window.location.pathname) {
					setIsPrefetching(true);
				}
			});

			const onPrefetchedListener = router.on('prefetched', (e) => {
				if (e.detail.visit.url.pathname === window.location.pathname) {
					setIsPrefetching(false);
					setIsPrefetched(true);
					setLastUpdatedAt(e.detail.fetchedAt);
				}
			});

			return () => {
				onPrefetchedListener();
				onPrefetchingListener();
			};
		},
		[],
		effectSlot,
	);

	return {
		lastUpdatedAt,
		isPrefetching,
		isPrefetched,
		flush: () => router.flush(window.location.pathname, options),
	};
}
