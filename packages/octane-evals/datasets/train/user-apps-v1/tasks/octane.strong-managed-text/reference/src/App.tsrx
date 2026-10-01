'use strong';
import { useState } from 'octane';

export function App({ name = 'Ada Lovelace' }: { name?: string }) @{
	const [follows, setFollows] = useState(0);

	<section>
		<h1>{name.toUpperCase() as string}</h1>
		<button onClick={() => setFollows(follows + 1)}>{`Follow (${follows})` as string}</button>
	</section>
}
