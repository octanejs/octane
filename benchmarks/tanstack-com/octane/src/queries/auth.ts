import { queryOptions } from '@octanejs/tanstack-query';
import { getCurrentUser } from '~/utils/auth.functions';

export const currentUserQueryOptions = () =>
	queryOptions({
		queryKey: ['auth', 'currentUser'],
		queryFn: () => getCurrentUser(),
	});
