'use strong';
// Workaround: guard the update with a ref.
import { useEffect, useRef, useState } from 'octane';

export function App({ first, last }: { first: string; last: string }) @{
	const [fullName, setFullName] = useState('');
	const synced = useRef('');

	useEffect(() => {
		if (synced.current !== `${first} ${last}`) {
			synced.current = `${first} ${last}`;
			setFullName(synced.current);
		}
	});

	<p>{`Signed in as ${fullName}` as string}</p>
}
