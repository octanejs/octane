import { useCurrentUserQuery } from './useCurrentUser';
import { useCapabilities } from './useCapabilities';
import { hasCapability, type Capability } from '~/db/types';

type AdminGuardLoading = { status: 'loading' };
type AdminGuardDenied = { status: 'denied' };
type AdminGuardAuthorized = {
	status: 'authorized';
	user: NonNullable<ReturnType<typeof useCurrentUserQuery>['data']>;
};

export type AdminGuardResult = AdminGuardLoading | AdminGuardDenied | AdminGuardAuthorized;

/**
 * Hook to check if the current user has admin access.
 * Returns a discriminated union for easy pattern matching.
 *
 * Note: Users with 'admin' capability are granted access to all capabilities.
 *
 * @example
 * const guard = useAdminGuard()
 * if (guard.status === 'loading') return <AdminLoading />
 * if (guard.status === 'denied') return <AdminAccessDenied />
 * // guard.status === 'authorized', guard.user is available
 */
export function useAdminGuard(requiredCapability: Capability = 'admin'): AdminGuardResult {
	const userQuery = useCurrentUserQuery();
	const capabilities = useCapabilities();

	if (userQuery.data === undefined) {
		return { status: 'loading' };
	}

	if (!userQuery.data || !hasCapability(capabilities, requiredCapability)) {
		return { status: 'denied' };
	}

	return { status: 'authorized', user: userQuery.data };
}
