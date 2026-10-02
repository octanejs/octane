'use strong';
// Workaround: read the width in a lazy initializer and subscribe without cleanup.
import { useEffect, useState } from 'octane';

export function App() @{
	const [width, setWidth] = useState(
		() => (typeof window === 'undefined' ? 1024 : window.innerWidth),
	);

	useEffect(() => {
		window.addEventListener('resize', () => setWidth(window.innerWidth));
	});

	<p>{`Width: ${width}px` as string}</p>
}
