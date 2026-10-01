'use strong';
// Workaround: defer the update to a microtask.
import { useEffect, useState } from 'octane';

export function App({ first, last }: { first: string; last: string }) @{
	const [fullName, setFullName] = useState('');

	useEffect(() => {
		queueMicrotask(() => setFullName(`${first} ${last}`));
	});

	<p>{`Signed in as ${fullName}` as string}</p>
}
