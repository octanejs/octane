'use strong';
// Alternative: an async effect body that checks response.ok before reading JSON.
import { useEffect, useState } from 'octane';

type User = { name: string };

export function App({ userId }: { userId: string }) @{
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		let ignore = false;
		async function load() {
			const response = await fetch(`/api/users/${userId}`);
			if (!response.ok) throw new Error(`Request failed with ${response.status}`);
			const next: User = await response.json();
			if (!ignore) setUser(next);
		}
		void load();
		return () => {
			ignore = true;
		};
	});

	<p>{(user ? user.name : 'Loading…') as string}</p>
}
