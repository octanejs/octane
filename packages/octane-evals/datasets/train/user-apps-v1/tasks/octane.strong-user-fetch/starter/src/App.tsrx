'use strong';
import { useEffect, useState } from 'octane';

type User = { name: string };

export function App({ userId }: { userId: string }) @{
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		fetch(`/api/users/${userId}`)
			.then((response) => response.json())
			.then((next: User) => setUser(next));
	});

	<p>{(user ? user.name : 'Loading…') as string}</p>
}
