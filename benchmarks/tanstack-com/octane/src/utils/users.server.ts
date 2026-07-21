import { db } from '~/db/client';
import { users } from '~/db/schema';
import { eq, and, or, ilike, sql, asc, desc, arrayOverlaps } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { getAuthenticatedUser } from './auth.server-helpers';
import { getBulkEffectiveCapabilities } from './capabilities.server';
import { recordAuditLog } from './audit.server';
import { type Capability, type SignupSource } from '~/db/types';

type UserRecord = InferSelectModel<typeof users>;

// Helper function to validate user capability
// Optimized: getEffectiveCapabilities is already called in getAuthenticatedUser,
// so we can reuse the capabilities from there
async function requireCapability({ data: { capability } }: { data: { capability: string } }) {
	const user = await getAuthenticatedUser();
	const hasAccess =
		user.capabilities.includes('admin') || user.capabilities.includes(capability as Capability);
	if (!hasAccess) {
		throw new Error(`${capability} capability required`);
	}
	return { currentUser: user };
}

// Server function wrapper for listUsers
export async function listUsers({ data }: { data: any }) {
	if (!data || !data.pagination) {
		throw new Error('Missing required');
	}

	const startTime = Date.now();

	// Validate admin capability
	await requireCapability({ data: { capability: 'admin' } });
	const authTime = Date.now() - startTime;

	const limit = data.pagination.limit;
	const pageIndex = data.pagination.page ?? 0;
	const useEffectiveCapabilities = data.useEffectiveCapabilities ?? true;

	// Build query conditions (excluding capability filters if using effective capabilities)
	const conditions = [];

	// Email filter (case-insensitive search)
	if (data.emailFilter && data.emailFilter.length > 0) {
		conditions.push(ilike(users.email, `%${data.emailFilter}%`));
	}

	// Name filter (search in name or displayUsername)
	if (data.nameFilter && data.nameFilter.length > 0) {
		const nameLower = data.nameFilter.toLowerCase();
		conditions.push(
			or(
				sql`LOWER(${users.name}) LIKE ${`%${nameLower}%`}`,
				sql`LOWER(${users.displayUsername}) LIKE ${`%${nameLower}%`}`,
			),
		);
	}

	// No capabilities filter - only apply if using direct capabilities
	if (data.noCapabilitiesFilter === true && !useEffectiveCapabilities) {
		conditions.push(sql`array_length(${users.capabilities}, 1) IS NULL`);
	}

	// Capability filter - only apply SQL filter if using direct capabilities
	if (data.capabilityFilter && data.capabilityFilter.length > 0 && !useEffectiveCapabilities) {
		// Use PostgreSQL array overlap operator (&&) with parameterized values
		conditions.push(arrayOverlaps(users.capabilities, data.capabilityFilter as Capability[]));
	}

	// Ads disabled filter
	if (typeof data.adsDisabledFilter === 'boolean') {
		conditions.push(eq(users.adsDisabled, data.adsDisabledFilter));
	}

	// Interested in hiding ads filter
	if (typeof data.interestedInHidingAdsFilter === 'boolean') {
		conditions.push(eq(users.interestedInHidingAds, data.interestedInHidingAdsFilter));
	}

	// Get filtered users with proper SQL pagination
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	// Build order by clause
	const getOrderByClause = () => {
		const dir = data.sortDir === 'asc' ? asc : desc;
		switch (data.sortBy) {
			case 'email':
				return dir(users.email);
			case 'user':
				return dir(users.name);
			case 'createdAt':
				return dir(users.createdAt);
			default:
				return desc(users.createdAt);
		}
	};
	const orderByClause = getOrderByClause();

	const queryStartTime = Date.now();

	// If filtering by effective capabilities, we need to fetch all matching users first,
	// then filter by effective capabilities in memory, then paginate
	let allMatchingUsers: UserRecord[] = [];
	let filteredUsers: UserRecord[] = [];

	if (useEffectiveCapabilities && (data.capabilityFilter?.length || data.noCapabilitiesFilter)) {
		// Fetch all users matching other filters (without pagination)
		allMatchingUsers = await db.select().from(users).where(whereClause).orderBy(orderByClause);

		// Get effective capabilities for all matching users
		const userIds = allMatchingUsers.map((u) => u.id);
		const effectiveCapabilitiesMap =
			userIds.length > 0 ? await getBulkEffectiveCapabilities(userIds) : {};

		// Filter by effective capabilities
		filteredUsers = allMatchingUsers.filter((user) => {
			const effectiveCapabilities = effectiveCapabilitiesMap[user.id] || [];

			// No capabilities filter
			if (data.noCapabilitiesFilter === true) {
				return effectiveCapabilities.length === 0;
			}

			// Capability filter
			if (data.capabilityFilter && data.capabilityFilter.length > 0) {
				// Check if effective capabilities overlap with filter
				return data.capabilityFilter.some((cap: Capability) => effectiveCapabilities.includes(cap));
			}

			return true;
		});

		// Apply pagination to filtered results
		const offset = Math.max(0, pageIndex * limit);
		const page = filteredUsers.slice(offset, offset + limit);
		const filteredCount = filteredUsers.length;
		const hasMore = offset + limit < filteredCount;

		const selectTime = Date.now() - queryStartTime;
		const totalTime = Date.now() - startTime;

		// Log performance metrics
		if (totalTime > 1000) {
			console.warn(`[listUsers] Slow query detected (effective capabilities):`, {
				authTime: `${authTime}ms`,
				selectTime: `${selectTime}ms`,
				totalTime: `${totalTime}ms`,
				filters: {
					emailFilter: !!data.emailFilter,
					nameFilter: !!data.nameFilter,
					capabilityFilter: !!data.capabilityFilter,
					noCapabilitiesFilter: data.noCapabilitiesFilter,
					useEffectiveCapabilities: true,
				},
				pagination: { limit, pageIndex, offset },
				resultCount: page.length,
				totalMatching: allMatchingUsers.length,
				filteredCount,
			});
		}

		// Transform to match expected format
		const transformedPage = page.map((user) => ({
			_id: user.id,
			userId: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			displayUsername: user.displayUsername,
			capabilities: user.capabilities,
			adsDisabled: user.adsDisabled,
			interestedInHidingAds: user.interestedInHidingAds,
			signupSources: user.signupSources,
			createdAt: user.createdAt.getTime(),
			updatedAt: user.updatedAt.getTime(),
		}));

		return {
			page: transformedPage,
			isDone: !hasMore,
			counts: {
				total: filteredCount,
				filtered: filteredCount,
				pages: Math.max(1, Math.ceil(filteredCount / limit)),
			},
		};
	} else {
		// Standard SQL-based filtering (direct capabilities or no capability filters)
		// Get total count (with filters applied)
		const [totalCount] = await db
			.select({ count: sql<number>`count(*)` })
			.from(users)
			.where(whereClause);

		const countTime = Date.now() - queryStartTime;

		// Get filtered count (same as total when filters are applied)
		const filteredCount = Number(totalCount.count);

		// Apply SQL-level pagination (LIMIT/OFFSET)
		const offset = Math.max(0, pageIndex * limit);
		const selectStartTime = Date.now();
		const page = await db
			.select()
			.from(users)
			.where(whereClause)
			.orderBy(orderByClause)
			.limit(limit)
			.offset(offset);

		const selectTime = Date.now() - selectStartTime;
		const totalTime = Date.now() - startTime;

		const hasMore = offset + limit < filteredCount;

		// Log performance metrics
		if (totalTime > 1000) {
			console.warn(`[listUsers] Slow query detected:`, {
				authTime: `${authTime}ms`,
				countTime: `${countTime}ms`,
				selectTime: `${selectTime}ms`,
				totalTime: `${totalTime}ms`,
				filters: {
					emailFilter: !!data.emailFilter,
					nameFilter: !!data.nameFilter,
					capabilityFilter: !!data.capabilityFilter,
					noCapabilitiesFilter: data.noCapabilitiesFilter,
					useEffectiveCapabilities: false,
				},
				pagination: { limit, pageIndex, offset },
				resultCount: page.length,
			});
		}

		// Transform to match expected format
		const transformedPage = page.map((user) => ({
			_id: user.id,
			userId: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			displayUsername: user.displayUsername,
			capabilities: user.capabilities,
			adsDisabled: user.adsDisabled,
			interestedInHidingAds: user.interestedInHidingAds,
			signupSources: user.signupSources,
			createdAt: user.createdAt.getTime(),
			updatedAt: user.updatedAt.getTime(),
		}));

		return {
			page: transformedPage,
			isDone: !hasMore,
			counts: {
				total: filteredCount,
				filtered: filteredCount,
				pages: Math.max(1, Math.ceil(filteredCount / limit)),
			},
		};
	}
}

// Get a single user by ID (admin only)
export async function getUser({ data }: { data: any }) {
	await requireCapability({ data: { capability: 'admin' } });

	const user = await db.query.users.findFirst({
		where: eq(users.id, data.userId),
	});

	if (!user) {
		return null;
	}

	return {
		_id: user.id,
		userId: user.id,
		email: user.email,
		name: user.name,
		image: user.image,
		oauthImage: user.oauthImage,
		displayUsername: user.displayUsername,
		capabilities: user.capabilities,
		adsDisabled: user.adsDisabled,
		interestedInHidingAds: user.interestedInHidingAds,
		lastUsedFramework: user.lastUsedFramework,
		signupSources: user.signupSources,
		sessionVersion: user.sessionVersion,
		createdAt: user.createdAt.getTime(),
		updatedAt: user.updatedAt.getTime(),
	};
}

// Server function wrapper for updateAdPreference
export async function updateAdPreference({ data }: { data: any }) {
	const user = await getAuthenticatedUser();

	// Validate disableAds capability
	await requireCapability({ data: { capability: 'disableAds' } });

	await db
		.update(users)
		.set({ adsDisabled: data.adsDisabled, updatedAt: new Date() })
		.where(eq(users.id, user.userId));

	return { success: true };
}

// Server function wrapper for setInterestedInHidingAds
export async function setInterestedInHidingAds({ data }: { data: any }) {
	const user = await getAuthenticatedUser();

	// Verify user exists
	const existingUser = await db.query.users.findFirst({
		where: eq(users.id, user.userId),
	});

	if (!existingUser) {
		throw new Error('User not found');
	}

	await db
		.update(users)
		.set({
			interestedInHidingAds: data.interested,
			updatedAt: new Date(),
		})
		.where(eq(users.id, user.userId));

	return { success: true };
}

// Server function to update user's last used framework preference
export async function updateLastUsedFramework({ data }: { data: any }) {
	const user = await getAuthenticatedUser();

	await db
		.update(users)
		.set({
			lastUsedFramework: data.framework,
			updatedAt: new Date(),
		})
		.where(eq(users.id, user.userId));

	return { success: true };
}

export async function addUserSignupSource({ data }: { data: { source: SignupSource } }) {
	const user = await getAuthenticatedUser();

	const existingUser = await db.query.users.findFirst({
		where: eq(users.id, user.userId),
		columns: {
			signupSources: true,
		},
	});

	if (!existingUser) {
		throw new Error('User not found');
	}

	if (existingUser.signupSources.includes(data.source)) {
		return {
			success: true,
			alreadyTagged: true,
			signupSources: existingUser.signupSources,
		};
	}

	const signupSources = [...existingUser.signupSources, data.source];

	await db
		.update(users)
		.set({
			signupSources,
			updatedAt: new Date(),
		})
		.where(eq(users.id, user.userId));

	return {
		success: true,
		alreadyTagged: false,
		signupSources,
	};
}

// Server function wrapper for updateUserCapabilities (admin only)
export async function updateUserCapabilities({ data }: { data: any }) {
	// Validate admin capability
	const { currentUser } = await requireCapability({
		data: { capability: 'admin' },
	});

	// Validate that target user exists
	const targetUser = await db.query.users.findFirst({
		where: eq(users.id, data.userId),
	});

	if (!targetUser) {
		throw new Error('Target user not found');
	}

	const capabilities = data.capabilities;
	const previousCapabilities = targetUser.capabilities;

	await db
		.update(users)
		.set({ capabilities, updatedAt: new Date() })
		.where(eq(users.id, data.userId));

	// Record audit log
	await recordAuditLog({
		actorId: currentUser.userId,
		action: 'user.capabilities.update',
		targetType: 'user',
		targetId: data.userId,
		details: {
			before: previousCapabilities,
			after: capabilities,
		},
	});

	return { success: true };
}

// Server function wrapper for adminSetAdsDisabled (admin only)
export async function adminSetAdsDisabled({ data }: { data: any }) {
	// Validate admin capability
	const { currentUser } = await requireCapability({
		data: { capability: 'admin' },
	});

	// Validate that target user exists
	const targetUser = await db.query.users.findFirst({
		where: eq(users.id, data.userId),
	});

	if (!targetUser) {
		throw new Error('Target user not found');
	}

	const previousAdsDisabled = targetUser.adsDisabled;

	await db
		.update(users)
		.set({ adsDisabled: data.adsDisabled, updatedAt: new Date() })
		.where(eq(users.id, data.userId));

	// Record audit log
	await recordAuditLog({
		actorId: currentUser.userId,
		action: 'user.adsDisabled.update',
		targetType: 'user',
		targetId: data.userId,
		details: {
			before: previousAdsDisabled,
			after: data.adsDisabled,
		},
	});

	return { success: true };
}

// Server function wrapper for bulkUpdateUserCapabilities (admin only)
export async function bulkUpdateUserCapabilities({ data }: { data: any }) {
	// Validate admin capability
	const { currentUser } = await requireCapability({
		data: { capability: 'admin' },
	});

	const validatedCapabilities = data.capabilities;

	// Update all users and collect audit data
	const auditData: Array<{
		userId: string;
		before: Capability[];
		after: Capability[];
	}> = [];

	await Promise.all(
		data.userIds.map(async (userId: string) => {
			const targetUser = await db.query.users.findFirst({
				where: eq(users.id, userId),
			});

			if (!targetUser) {
				throw new Error(`User ${userId} not found`);
			}

			auditData.push({
				userId,
				before: targetUser.capabilities,
				after: validatedCapabilities,
			});

			await db
				.update(users)
				.set({ capabilities: validatedCapabilities, updatedAt: new Date() })
				.where(eq(users.id, userId));
		}),
	);

	// Record audit logs for each user
	await Promise.all(
		auditData.map((audit) =>
			recordAuditLog({
				actorId: currentUser.userId,
				action: 'user.capabilities.update',
				targetType: 'user',
				targetId: audit.userId,
				details: {
					before: audit.before,
					after: audit.after,
					bulkOperation: true,
				},
			}),
		),
	);

	return { success: true, updated: data.userIds.length };
}

// Revoke all sessions for a user by incrementing sessionVersion
// This invalidates all signed cookies for the user
export async function revokeUserSessions({ data: { userId } }: { data: { userId: string } }) {
	// Get current user for audit log and authorization check
	const currentUser = await getAuthenticatedUser();

	// Authorization: users can only revoke their own sessions, unless they're admin
	const isAdmin = currentUser.capabilities.includes('admin');
	const isOwnSession = currentUser.userId === userId;
	if (!isAdmin && !isOwnSession) {
		throw new Error('Unauthorized: You can only revoke your own sessions unless you are an admin');
	}

	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: {
			sessionVersion: true,
		},
	});

	if (!user) {
		throw new Error('User not found');
	}

	await db
		.update(users)
		.set({ sessionVersion: user.sessionVersion + 1, updatedAt: new Date() })
		.where(eq(users.id, userId));

	// Record audit log
	await recordAuditLog({
		actorId: currentUser.userId,
		action: 'user.sessions.revoke',
		targetType: 'user',
		targetId: userId,
		details: {
			previousVersion: user.sessionVersion,
			newVersion: user.sessionVersion + 1,
		},
	});

	return { success: true };
}

// Revert profile image to OAuth provider image
export async function revertProfileImage() {
	const currentUser = await getAuthenticatedUser();

	// Get the user's oauthImage
	const user = await db.query.users.findFirst({
		where: eq(users.id, currentUser.userId),
		columns: {
			oauthImage: true,
		},
	});

	if (!user?.oauthImage) {
		throw new Error('No OAuth image available to revert to');
	}

	// Set image to null, display will fall back to oauthImage
	await db
		.update(users)
		.set({ image: null, updatedAt: new Date() })
		.where(eq(users.id, currentUser.userId));

	return { success: true, image: null, oauthImage: user.oauthImage };
}

// Remove profile image entirely (show initials/fallback)
export async function removeProfileImage() {
	const currentUser = await getAuthenticatedUser();

	await db
		.update(users)
		.set({ image: null, updatedAt: new Date() })
		.where(eq(users.id, currentUser.userId));

	return { success: true };
}
