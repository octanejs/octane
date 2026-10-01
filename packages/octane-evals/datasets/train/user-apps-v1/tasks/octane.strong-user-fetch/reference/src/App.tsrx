'use strong';
import { useEffect, useState } from 'octane';

type User = { name: string };

export function App({ userId }: { userId: string }) @{
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		let current = true;
		fetch(`/api/users/${userId}`).then((response) => response.json()).then((next: User) => {
			if (current) setUser(next);
		});
		return () => {
			current = false;
		};
	});

	<p>{(user ? user.name : 'Loading…') as string}</p>
}
