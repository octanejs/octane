import { useCurrentUserQuery } from './useCurrentUser';
import type { Capability } from '~/db/types';

/**
 * Hook to get capabilities for the current user.
 * Returns an empty array until the user query is resolved.
 */
export function useCapabilities(): Capability[] {
	const userQuery = useCurrentUserQuery();
	return userQuery.data?.capabilities || [];
}
