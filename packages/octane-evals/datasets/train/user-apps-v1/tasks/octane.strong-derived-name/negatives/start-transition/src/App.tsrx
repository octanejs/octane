'use strong';
// Workaround: defer the update with startTransition.
import { startTransition, useEffect, useState } from 'octane';

export function App({ first, last }: { first: string; last: string }) @{
	const [fullName, setFullName] = useState('');

	useEffect(() => {
		startTransition(() => setFullName(`${first} ${last}`));
	});

	<p>{`Signed in as ${fullName}` as string}</p>
}
