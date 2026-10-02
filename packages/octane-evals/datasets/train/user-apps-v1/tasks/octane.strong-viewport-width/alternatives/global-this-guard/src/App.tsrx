'use strong';
// Alternative: guard the lazy initializer through globalThis and subscribe in an
// effect that returns its cleanup.
import { useEffect, useState } from 'octane';

export function App() @{
	const [width, setWidth] = useState(() =>
		globalThis.window === undefined ? 1024 : globalThis.window.innerWidth,
	);

	useEffect(() => {
		const update = () => setWidth(window.innerWidth);
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	});

	<p>{`Width: ${width}px` as string}</p>
}
