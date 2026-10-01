'use strong';
// Alternative: capture the width in a server-safe lazy initializer and subscribe
// in an effect that returns its cleanup.
import { useEffect, useState } from 'octane';

export function App() @{
	const [width, setWidth] = useState(
		() => (typeof window === 'undefined' ? 1024 : window.innerWidth),
	);

	useEffect(() => {
		const update = () => setWidth(window.innerWidth);
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	});

	<p>{`Width: ${width}px` as string}</p>
}
