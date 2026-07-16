import { useEffect, useState } from 'octane';

// Octane effect with cleanup: unmounting the wrapper from React clears the
// interval (StrictMode's double mount/unmount is handled too).
export function Clock() @{
	const [now, setNow] = useState(() => new Date().toLocaleTimeString());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date().toLocaleTimeString()), 1000);
		return () => clearInterval(id);
	}, []);
	<p class="clock">
		{'Octane clock: ' + now}
	</p>
}
