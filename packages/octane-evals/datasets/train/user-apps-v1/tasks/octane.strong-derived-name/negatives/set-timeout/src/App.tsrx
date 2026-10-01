'use strong';
// Workaround: defer the update with a zero-delay timer.
import { useEffect, useState } from 'octane';

export function App({ first, last }: { first: string; last: string }) @{
	const [fullName, setFullName] = useState('');

	useEffect(() => {
		setTimeout(() => setFullName(`${first} ${last}`), 0);
	});

	<p>{`Signed in as ${fullName}` as string}</p>
}
