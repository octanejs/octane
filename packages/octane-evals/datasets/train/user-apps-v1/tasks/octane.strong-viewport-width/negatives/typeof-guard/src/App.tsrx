'use strong';
// Workaround: guard the browser read with typeof.

export function App() @{
	const width = typeof window === 'undefined' ? 1024 : window.innerWidth;

	<p>{`Width: ${width}px` as string}</p>
}
