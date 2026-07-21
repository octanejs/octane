// Bench delta: upstream (users.functions.upstream.ts.txt) backs these with the
// user database. No login exists in the benchmark, so reads answer empty and
// writes fail exactly as they do upstream for an unauthenticated caller.
import { createServerFn } from '@octanejs/tanstack-start';

const AUTH_DISABLED_ERROR = 'Authentication is disabled in the benchmark build';

const authDisabled = () => {
	throw new Error(AUTH_DISABLED_ERROR);
};

export const listUsers = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => ({ users: [], total: 0 }));

export const getUser = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => null);

export const updateAdPreference = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(authDisabled);

export const updateLastUsedFramework = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => null);

export const updateUserCapabilities = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(authDisabled);

export const adminSetAdsDisabled = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(authDisabled);

export const bulkUpdateUserCapabilities = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(authDisabled);

export const setInterestedInHidingAds = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(authDisabled);

export const addUserSignupSource = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => null);

export const revertProfileImage = createServerFn({ method: 'POST' }).handler(authDisabled);

export const removeProfileImage = createServerFn({ method: 'POST' }).handler(authDisabled);
