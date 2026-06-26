// The navigation engine (renders nothing). On mount it kicks off the initial
// `router.load()`; it subscribes to history so back/forward and `Link` clicks
// reload the matches; and it supplies `router.startTransition`, which router-core
// calls to wrap state updates. v1 runs that update synchronously (no concurrent
// pending UI) — a `useTransition`-backed version can come with loaders/pending.
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
