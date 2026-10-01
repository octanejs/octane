'use strong';
// Workaround: optional-chain the browser global; a real server has no `window`
// binding, so this throws a ReferenceError during server rendering.
import { useEffect, useState } from 'octane';

export function App() @{
	const [width, setWidth] = useState(() => window?.innerWidth ?? 1024);

	useEffect(() => {
		const update = () => setWidth(window.innerWidth);
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	});

	<p>{`Width: ${width}px` as string}</p>
}
