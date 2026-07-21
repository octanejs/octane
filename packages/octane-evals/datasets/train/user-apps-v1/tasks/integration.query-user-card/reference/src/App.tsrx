import { QueryClientProvider, useQuery } from '@octanejs/tanstack-query';
import type { QueryClient } from '@octanejs/tanstack-query';

export interface User {
	id: string;
	name: string;
	email: string;
}

interface UserCardProps {
	userId: string;
	loadUser: (userId: string) => Promise<User>;
}

function UserCard(props: UserCardProps) @{
	const query = useQuery({
		queryKey: ['user', props.userId],
		queryFn: () => props.loadUser(props.userId),
		retry: false,
	});

	<section aria-label="User card">
		@if (query.isPending) {
			<p role="status">Loading user…</p>
		} @else if (query.isError) {
			<p role="alert">{'Could not load user: ' + (query.error as Error).message}</p>
		} @else {
			<>
				<h1>{query.data.name as string}</h1>
				<p>{query.data.email as string}</p>
			</>
		}
	</section>
}

export function App(props: {
	client: QueryClient;
	userId: string;
	loadUser: (userId: string) => Promise<User>;
}) @{
	<QueryClientProvider client={props.client}>
		<UserCard userId={props.userId} loadUser={props.loadUser} />
	</QueryClientProvider>
}
