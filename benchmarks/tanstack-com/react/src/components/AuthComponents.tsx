import { useCurrentUserQuery } from '~/hooks/useCurrentUser';

// Authentication wrapper components for our custom session system
export function Authenticated({ children }: { children: React.ReactNode }) {
	const userQuery = useCurrentUserQuery();
	if (userQuery.data) {
		return <>{children}</>;
	}
	return null;
}

export function Unauthenticated({ children }: { children: React.ReactNode }) {
	const userQuery = useCurrentUserQuery();
	if (!userQuery.data && !userQuery.isLoading) {
		return <>{children}</>;
	}
	return null;
}

export function AuthLoading({ children }: { children: React.ReactNode }) {
	const userQuery = useCurrentUserQuery();
	if (userQuery.isLoading) {
		return <>{children}</>;
	}
	return null;
}
