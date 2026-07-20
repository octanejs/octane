/**
 * Capabilities Service
 *
 * Handles authorization via capability-based access control.
 * Uses inversion of control for data access.
 */

import type { ICapabilitiesRepository, Capability } from './types';

export {
	hasCapability,
	hasAllCapabilities,
	hasAnyCapability,
	isAdmin,
	userHasCapability,
	userIsAdmin,
} from './capabilities';

// ============================================================================
// Capabilities Service
// ============================================================================

export class CapabilitiesService {
	constructor(private repository: ICapabilitiesRepository) {}

	/**
	 * Get effective capabilities for a user (direct + role-based)
	 */
	async getEffectiveCapabilities(userId: string): Promise<Capability[]> {
		return this.repository.getEffectiveCapabilities(userId);
	}

	/**
	 * Get effective capabilities for multiple users efficiently
	 */
	async getBulkEffectiveCapabilities(userIds: string[]): Promise<Record<string, Capability[]>> {
		return this.repository.getBulkEffectiveCapabilities(userIds);
	}
}
