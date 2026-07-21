/**
 * Capabilities Server Utilities
 *
 * This module delegates to the isolated auth module at ~/auth/
 * for backward compatibility with existing imports.
 *
 * For new code, import directly from '~/auth/index.server'.
 */

import { getCapabilitiesRepository } from '~/auth/index.server';
import type { Capability } from '~/auth/index.server';

// Re-export types for backward compatibility
export type { Capability };

/**
 * Get effective capabilities for a user (direct + role-based)
 */
export async function getEffectiveCapabilities(userId: string): Promise<Capability[]> {
	const repository = getCapabilitiesRepository();
	return repository.getEffectiveCapabilities(userId);
}

/**
 * Get effective capabilities for multiple users efficiently
 */
export async function getBulkEffectiveCapabilities(
	userIds: string[],
): Promise<Record<string, Capability[]>> {
	const repository = getCapabilitiesRepository();
	return repository.getBulkEffectiveCapabilities(userIds);
}
