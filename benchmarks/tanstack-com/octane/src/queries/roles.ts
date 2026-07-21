import { queryOptions } from '@octanejs/tanstack-query';
import { listRoles, getBulkUserRoles, getBulkEffectiveCapabilities } from '~/utils/roles.functions';
import type { Capability } from '~/db/types';

export interface ListRolesFilters {
	nameFilter?: string;
	capabilityFilter?: Capability[];
}

export const listRolesQueryOptions = (filters?: ListRolesFilters) =>
	queryOptions({
		queryKey: ['admin', 'roles', filters],
		queryFn: () => listRoles({ data: filters || {} }),
	});

export const getBulkUserRolesQueryOptions = (userIds: string[]) =>
	queryOptions({
		queryKey: ['admin', 'bulkUserRoles', userIds],
		queryFn: () => getBulkUserRoles({ data: { userIds } }),
		enabled: userIds.length > 0,
	});

export const getBulkEffectiveCapabilitiesQueryOptions = (userIds: string[]) =>
	queryOptions({
		queryKey: ['admin', 'bulkEffectiveCapabilities', userIds],
		queryFn: () => getBulkEffectiveCapabilities({ data: { userIds } }),
		enabled: userIds.length > 0,
	});
