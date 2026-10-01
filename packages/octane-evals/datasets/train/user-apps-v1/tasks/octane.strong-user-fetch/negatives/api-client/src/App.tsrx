'use strong';
// Workaround: hide fetch behind a small API client.
import { useEffect, useState } from 'octane';

type User = { name: string };

const api = {
	getUser: (userId: string): Promise<User> => fetch(`/api/users/${userId}`).then(
		(response) => response.json(),
	),
};

export function App({ userId }: { userId: string }) @{
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		api.getUser(userId).then(setUser);
	});

	<p>{(user ? user.name : 'Loading…') as string}</p>
}
