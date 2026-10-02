'use strong';

export function App({ first, last }: { first: string; last: string }) @{
	const fullName = `${first} ${last}`;

	<p>{`Signed in as ${fullName}` as string}</p>
}
