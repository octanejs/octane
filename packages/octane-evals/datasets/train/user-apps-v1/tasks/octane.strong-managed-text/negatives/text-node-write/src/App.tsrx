'use strong';
// Workaround: write the rendered text node instead of the element.
import { useEffect, useRef, useState } from 'octane';

export function App({ name = 'Ada Lovelace' }: { name?: string }) @{
	const [follows, setFollows] = useState(0);
	const heading = useRef<HTMLHeadingElement | null>(null);

	useEffect(() => {
		heading.current!.firstChild!.textContent = name.toUpperCase();
	});

	<section>
		<h1 ref={heading}>{name as string}</h1>
		<button onClick={() => setFollows(follows + 1)}>{`Follow (${follows})` as string}</button>
	</section>
}
