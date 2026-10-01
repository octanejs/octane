'use strong';
// Workaround: poll the width with an interval that is never cleared.
import { useEffect, useState } from 'octane';

export function App() @{
	const [width, setWidth] = useState(1024);

	useEffect(() => {
		setInterval(() => setWidth(window.innerWidth), 10);
	});

	<p>{`Width: ${width}px` as string}</p>
}
