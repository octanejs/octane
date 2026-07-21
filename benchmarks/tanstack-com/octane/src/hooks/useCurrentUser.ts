import { useQuery, queryOptions } from '@octanejs/tanstack-query';
import { useRouteContext } from '@octanejs/tanstack-router';
import { getCurrentUser } from '~/utils/auth.functions';

export const currentUserQueryOptions = queryOptions({
	queryKey: ['currentUser'],
	queryFn: async () => {
		return getCurrentUser();
	},
	staleTime: 5 * 1000,
});

export function useCurrentUserQuery() {
	// Get user from route context (set in beforeLoad)
	const routeContext = useRouteContext({ strict: false });
	const contextUser = routeContext?.user;

	return useQuery({
		...currentUserQueryOptions,
		initialData: contextUser,
	});
}

/**
 * Simple hook to get the current user data
 * Returns undefined if not logged in
 */
export function useCurrentUser() {
	const query = useCurrentUserQuery();
	return query.data;
}
