'use strong';
import { useSyncExternalStore } from 'octane';

function subscribe(notify: () => void) {
	window.addEventListener('resize', notify);
	return () => window.removeEventListener('resize', notify);
}

export function App() @{
	const width = useSyncExternalStore(subscribe, () => window.innerWidth, () => 1024);

	<p>{`Width: ${width}px` as string}</p>
}
