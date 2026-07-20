// Bench delta: upstream (auth.functions.upstream.ts.txt) routes through the
// database-backed auth service. The benchmark has no login, so these fns
// permanently answer as they would for an anonymous visitor: no user, and
// guarded calls fail the same way they fail upstream when unauthenticated.
import { createServerFn } from '@tanstack/react-start';

export const getCurrentUser = createServerFn({ method: 'POST' }).handler(async () => null);

export const requireAuth = createServerFn({ method: 'POST' }).handler(async () => {
	throw new Error('Not authenticated');
});

export const requireCapability = createServerFn({ method: 'POST' })
	.validator((data: { capability: string }) => data)
	.handler(async () => {
		throw new Error('Not authenticated');
	});

export async function loadUser() {
	return null;
}

export async function requireAuthUser(): Promise<never> {
	throw new Error('Not authenticated');
}

export async function requireCapabilityUser(capability: string): Promise<never> {
	throw new Error(`Missing required capability: ${capability}`);
}

export { ADMIN_ACCESS_CAPABILITIES as ADMIN_CAPABILITIES } from '~/db/types';

export const requireAnyAdminCapability = createServerFn({
	method: 'POST',
}).handler(async () => {
	throw new Error('Not authenticated');
});
