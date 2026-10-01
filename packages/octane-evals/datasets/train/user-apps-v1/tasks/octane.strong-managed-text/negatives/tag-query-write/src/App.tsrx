'use strong';
// Workaround: find the heading with a tag selector instead of a ref.
import { useEffect, useState } from 'octane';

export function App({ name = 'Ada Lovelace' }: { name?: string }) @{
	const [follows, setFollows] = useState(0);

	useEffect(() => {
		document.querySelector('h1')!.textContent = name.toUpperCase();
	});

	<section>
		<h1>{name as string}</h1>
		<button onClick={() => setFollows(follows + 1)}>{`Follow (${follows})` as string}</button>
	</section>
}
