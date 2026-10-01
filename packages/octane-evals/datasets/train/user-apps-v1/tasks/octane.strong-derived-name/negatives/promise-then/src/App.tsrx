'use strong';
// Workaround: defer the update behind a resolved promise.
import { useEffect, useState } from 'octane';

export function App({ first, last }: { first: string; last: string }) @{
	const [fullName, setFullName] = useState('');

	useEffect(() => {
		Promise.resolve().then(() => setFullName(`${first} ${last}`));
	});

	<p>{`Signed in as ${fullName}` as string}</p>
}
