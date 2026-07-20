/**
 * Auth Guards Module
 *
 * Provides guard functions for protecting routes and server functions.
 * These are convenience wrappers around the auth service.
 */

import type { AuthUser, Capability, IAuthService } from './types';
import { AuthError } from './types';

// ============================================================================
// Guard Factory
// ============================================================================

/**
 * Create guard functions bound to an auth service instance
 */
export function createAuthGuards(authService: IAuthService) {
	return {
		/**
		 * Get current user (non-blocking, returns null if not authenticated)
		 */
		async getCurrentUser(request: Request): Promise<AuthUser | null> {
			try {
				return await authService.getCurrentUser(request);
			} catch {
				return null;
			}
		},

		/**
		 * Require authentication (throws if not authenticated)
		 */
		async requireAuth(request: Request): Promise<AuthUser> {
			const user = await authService.getCurrentUser(request);
			if (!user) {
				throw new AuthError('Not authenticated', 'NOT_AUTHENTICATED');
			}
			return user;
		},

		/**
		 * Require specific capability (throws if not authorized)
		 */
		async requireCapability(request: Request, capability: Capability): Promise<AuthUser> {
			const user = await authService.getCurrentUser(request);
			if (!user) {
				throw new AuthError('Not authenticated', 'NOT_AUTHENTICATED');
			}

			const hasAccess =
				user.capabilities.includes('admin') || user.capabilities.includes(capability);

			if (!hasAccess) {
				throw new AuthError(`Missing required capability: ${capability}`, 'MISSING_CAPABILITY');
			}

			return user;
		},

		/**
		 * Require admin access
		 */
		async requireAdmin(request: Request): Promise<AuthUser> {
			return this.requireCapability(request, 'admin');
		},

		/**
		 * Check if user has capability (non-throwing)
		 */
		async hasCapability(request: Request, capability: Capability): Promise<boolean> {
			try {
				await this.requireCapability(request, capability);
				return true;
			} catch {
				return false;
			}
		},

		/**
		 * Check if user is authenticated (non-throwing)
		 */
		async isAuthenticated(request: Request): Promise<boolean> {
			const user = await this.getCurrentUser(request);
			return user !== null;
		},

		/**
		 * Check if user is admin (non-throwing)
		 */
		async isAdmin(request: Request): Promise<boolean> {
			return this.hasCapability(request, 'admin');
		},
	};
}

// ============================================================================
// Guard Types
// ============================================================================

export type AuthGuards = ReturnType<typeof createAuthGuards>;

// ============================================================================
// Capability Guard Decorator Pattern (for server functions)
// ============================================================================

/**
 * Create a guard that wraps a handler with capability check
 */
export function withCapability<TArgs extends unknown[], TReturn>(
	guards: AuthGuards,
	capability: Capability,
	getRequest: () => Request,
	handler: (user: AuthUser, ...args: TArgs) => TReturn,
) {
	return async (...args: TArgs): Promise<Awaited<TReturn>> => {
		const request = getRequest();
		const user = await guards.requireCapability(request, capability);
		return (await handler(user, ...args)) as Awaited<TReturn>;
	};
}

/**
 * Create a guard that wraps a handler with auth check
 */
export function withAuth<TArgs extends unknown[], TReturn>(
	guards: AuthGuards,
	getRequest: () => Request,
	handler: (user: AuthUser, ...args: TArgs) => TReturn,
) {
	return async (...args: TArgs): Promise<Awaited<TReturn>> => {
		const request = getRequest();
		const user = await guards.requireAuth(request);
		return (await handler(user, ...args)) as Awaited<TReturn>;
	};
}
