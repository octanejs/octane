'use strong';
// Alternative: abort the superseded request in the effect cleanup.
import { useEffect, useState } from 'octane';

type User = { name: string };

export function App({ userId }: { userId: string }) @{
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		fetch(`/api/users/${userId}`, { signal: controller.signal })
			.then((response) => response.json())
			.then((next: User) => setUser(next))
			.catch((error: unknown) => {
				if ((error as Error).name !== 'AbortError') throw error;
			});
		return () => controller.abort();
	});

	<p>{(user ? user.name : 'Loading…') as string}</p>
}
