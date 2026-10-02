'use strong';
import { useEffect, useState } from 'octane';

export function App({ first, last }: { first: string; last: string }) @{
	const [fullName, setFullName] = useState('');

	useEffect(() => {
		setFullName(`${first} ${last}`);
	});

	<p>{`Signed in as ${fullName}` as string}</p>
}
