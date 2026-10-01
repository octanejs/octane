'use strong';
// Workaround: return a new snapshot object from useSyncExternalStore.
import { useSyncExternalStore } from 'octane';

function subscribe(notify: () => void) {
	window.addEventListener('resize', notify);
	return () => window.removeEventListener('resize', notify);
}

export function App() @{
	const viewport = useSyncExternalStore(
		subscribe,
		() => ({ width: window.innerWidth }),
		() => ({ width: 1024 }),
	);

	<p>{`Width: ${viewport.width}px` as string}</p>
}
