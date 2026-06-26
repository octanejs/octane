// The navigation engine (renders nothing). On mount it kicks off the initial
// `router.load()`; it subscribes to history so back/forward and `Link` clicks
// reload the matches; and it supplies `router.startTransition`, which router-core
// calls to wrap every navigation state update. Driving that through octane's
// `startTransition` makes navigation concurrent: when the next route suspends (a
// `useSuspenseQuery`/loader), octane keeps the CURRENT page on screen until the
// data resolves instead of flashing a fallback.
import { useEffect, useLayoutEffect, useRef } from 'octane';
import { useRouter } from './context.ts';

export function Transitioner() @{
	const router = useRouter();
	const mounted = useRef(false);

	router.startTransition = (fn) => fn();

	useEffect(() => {
		const unsub = router.history.subscribe(() => router.load());
		return () => unsub();
	}, [router]);

	useLayoutEffect(() => {
		if (mounted.current) return;
		mounted.current = true;
		router.load();
	}, []);

	<></>
}
