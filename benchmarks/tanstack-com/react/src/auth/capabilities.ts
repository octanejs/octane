import type { AuthUser } from './types';
import {
	type Capability,
	hasCapability,
	hasAllCapabilities,
	hasAnyCapability,
	isAdmin,
} from '~/db/types';

export { hasCapability, hasAllCapabilities, hasAnyCapability, isAdmin };

export function userHasCapability(
	user: AuthUser | null | undefined,
	capability: Capability,
): boolean {
	if (!user) return false;
	return hasCapability(user.capabilities, capability);
}

export function userIsAdmin(user: AuthUser | null | undefined): boolean {
	if (!user) return false;
	return isAdmin(user.capabilities);
}
