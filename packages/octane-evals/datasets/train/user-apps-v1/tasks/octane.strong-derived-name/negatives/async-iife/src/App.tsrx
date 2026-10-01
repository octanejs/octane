'use strong';
// Workaround: wrap the update in an async function.
import { useEffect, useState } from 'octane';

export function App({ first, last }: { first: string; last: string }) @{
	const [fullName, setFullName] = useState('');

	useEffect(() => {
		(async () => {
			await null;
			setFullName(`${first} ${last}`);
		})();
	});

	<p>{`Signed in as ${fullName}` as string}</p>
}
