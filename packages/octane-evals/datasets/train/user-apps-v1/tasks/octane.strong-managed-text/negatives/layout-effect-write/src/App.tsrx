'use strong';
// Workaround: move the same write into a layout effect.
import { useLayoutEffect, useRef, useState } from 'octane';

export function App({ name = 'Ada Lovelace' }: { name?: string }) @{
	const [follows, setFollows] = useState(0);
	const heading = useRef<HTMLHeadingElement | null>(null);

	useLayoutEffect(() => {
		heading.current!.textContent = name.toUpperCase();
	});

	<section>
		<h1 ref={heading}>{name as string}</h1>
		<button onClick={() => setFollows(follows + 1)}>{`Follow (${follows})` as string}</button>
	</section>
}
