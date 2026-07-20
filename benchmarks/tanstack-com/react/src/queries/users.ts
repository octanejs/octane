import { queryOptions } from '@tanstack/react-query';
import { listUsers } from '~/utils/users.functions';
import type { Capability } from '~/db/types';

export interface ListUsersFilters {
	pagination: {
		limit: number;
		page?: number;
	};
	emailFilter?: string;
	nameFilter?: string;
	capabilityFilter?: Capability[];
	noCapabilitiesFilter?: boolean;
	adsDisabledFilter?: boolean;
	interestedInHidingAdsFilter?: boolean;
	useEffectiveCapabilities?: boolean;
	sortBy?: string;
	sortDir?: 'asc' | 'desc';
}

export const listUsersQueryOptions = (filters: ListUsersFilters) =>
	queryOptions({
		queryKey: ['admin', 'users', filters],
		queryFn: () => listUsers({ data: filters }),
		staleTime: 0,
	});
