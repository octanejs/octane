import type { QueryClient } from '@octanejs/tanstack-query';

export interface User {
	id: string;
	name: string;
	email: string;
}

export function App(_props: {
	client: QueryClient;
	userId: string;
	loadUser: (userId: string) => Promise<User>;
}) @{
	<section aria-label="User card">
		<p role="status">Loading user…</p>
	</section>
}
