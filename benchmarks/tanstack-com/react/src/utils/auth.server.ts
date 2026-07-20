/**
 * Auth Server Utilities
 *
 * This module delegates to the isolated auth module at ~/auth/
 * for backward compatibility with existing imports.
 *
 * For new code, import directly from '~/auth/index.server'.
 */

import { getRequest } from '@tanstack/react-start/server';
import type { Capability } from '~/auth/index.server';
import { ADMIN_ACCESS_CAPABILITIES } from '~/db/types';

async function loadAuthServer() {
	return import('~/auth/index.server');
}

/**
 * Get the current user. Plain async function: callable from anywhere
 * server-side (route handlers, server-fn handlers, other helpers).
 *
 * NOTE: Keep this as a plain server-side function. Nesting `createServerFn`
 * inside this `.server.ts` helper can leave callers with a stale `createSsrRpc`
 * stub that is not in the runtime registry, so server-fn -> server-fn chains
 * fail with "Server function info not found for <id>". The client-facing RPC
 * wrappers live in `auth.functions.ts`.
 */
export async function getCurrentUser() {
	const request = getRequest();
	const { getAuthService } = await loadAuthServer();
	return getAuthService().getCurrentUser(request);
}

/**
 * Require authentication. Throws if no user.
 */
export async function requireAuth() {
	const request = getRequest();
	const { getAuthGuards } = await loadAuthServer();
	return getAuthGuards().requireAuth(request);
}

/**
 * Require a specific capability. Throws if not authorized.
 *
 * Signature accepts `{ data: { capability } }` for compatibility with the
 * historical `createServerFn` shape -- callers that already pass that wrapper
 * keep working without churn.
 */
export async function requireCapability({
	data: { capability },
}: {
	data: { capability: Capability | string };
}) {
	const request = getRequest();
	const { getAuthGuards } = await loadAuthServer();
	return getAuthGuards().requireCapability(request, capability as Capability);
}

/**
 * Load user from session (non-blocking, returns null if not authenticated)
 * Can be called from loaders or beforeLoad
 */
export async function loadUser() {
	try {
		return await getCurrentUser();
	} catch {
		return null;
	}
}

/**
 * Require authentication (throws if not authenticated)
 * Can be called from loaders or beforeLoad
 */
export async function requireAuthUser() {
	try {
		return await requireAuth();
	} catch {
		throw new Error('Not authenticated');
	}
}

/**
 * Require a specific capability (throws if not authorized)
 * Can be called from loaders or beforeLoad
 */
export async function requireCapabilityUser(capability: string) {
	try {
		return await requireCapability({ data: { capability } });
	} catch {
		throw new Error(`Missing required capability: ${capability}`);
	}
}

/** @deprecated Import from ~/db/types instead */
export { ADMIN_ACCESS_CAPABILITIES as ADMIN_CAPABILITIES } from '~/db/types';

/**
 * Require any admin-like capability. Used by /admin area guards.
 */
export async function requireAnyAdminCapability() {
	const request = getRequest();
	const { getAuthService } = await loadAuthServer();
	const user = await getAuthService().getCurrentUser(request);

	if (!user) {
		throw new Error('Not authenticated');
	}

	const hasAdminCapability = user.capabilities.some((cap) =>
		(ADMIN_ACCESS_CAPABILITIES as readonly string[]).includes(cap),
	);

	if (!hasAdminCapability) {
		throw new Error('Admin access required');
	}

	return user;
}
