/**
 * Auth Repositories
 *
 * Implementation of repository interfaces using the application's database.
 * This is the bridge between the auth module and the actual data layer.
 *
 * Note: This file imports from the application's database, making it
 * application-specific. The auth module itself (types, services) remains
 * database-agnostic through the repository interfaces.
 */

import { db } from '~/db/client';
import { users, oauthAccounts, roles, roleAssignments } from '~/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type {
	Capability,
	DbUser,
	ICapabilitiesRepository,
	IOAuthAccountRepository,
	IUserRepository,
	OAuthProvider,
	SignupSource,
} from './types';
import { encryptToken, decryptStoredToken } from '~/utils/crypto.server';

// ============================================================================
// User Repository Implementation
// ============================================================================

export class DrizzleUserRepository implements IUserRepository {
	async findById(userId: string): Promise<DbUser | null> {
		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
		});

		if (!user) return null;

		return this.mapToDbUser(user);
	}

	async findByEmail(email: string): Promise<DbUser | null> {
		const user = await db.query.users.findFirst({
			where: eq(users.email, email),
		});

		if (!user) return null;

		return this.mapToDbUser(user);
	}

	async create(data: {
		email: string;
		name?: string;
		image?: string;
		oauthImage?: string;
		displayUsername?: string;
		capabilities?: Capability[];
		signupSources?: SignupSource[];
	}): Promise<DbUser> {
		const [newUser] = await db
			.insert(users)
			.values({
				email: data.email,
				name: data.name,
				image: data.image,
				oauthImage: data.oauthImage,
				displayUsername: data.displayUsername,
				capabilities: data.capabilities || [],
				signupSources: data.signupSources ?? [],
			})
			.returning();

		if (!newUser) {
			throw new Error('Failed to create user');
		}

		return this.mapToDbUser(newUser);
	}

	async update(
		userId: string,
		data: Partial<{
			email: string;
			name: string;
			image: string | null;
			oauthImage: string;
			displayUsername: string;
			capabilities: Capability[];
			adsDisabled: boolean;
			interestedInHidingAds: boolean;
			lastUsedFramework: string;
			sessionVersion: number;
			signupSources: SignupSource[];
			updatedAt: Date;
		}>,
	): Promise<void> {
		await db
			.update(users)
			.set({ ...data, updatedAt: data.updatedAt || new Date() })
			.where(eq(users.id, userId));
	}

	async incrementSessionVersion(userId: string): Promise<void> {
		await db
			.update(users)
			.set({
				sessionVersion: sql`${users.sessionVersion} + 1`,
				updatedAt: new Date(),
			})
			.where(eq(users.id, userId));
	}

	private mapToDbUser(user: typeof users.$inferSelect): DbUser {
		return {
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			oauthImage: user.oauthImage,
			displayUsername: user.displayUsername,
			capabilities: user.capabilities as Capability[],
			adsDisabled: user.adsDisabled,
			interestedInHidingAds: user.interestedInHidingAds,
			lastUsedFramework: user.lastUsedFramework,
			signupSources: user.signupSources,
			sessionVersion: user.sessionVersion,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		};
	}
}

// ============================================================================
// OAuth Account Repository Implementation
// ============================================================================

export class DrizzleOAuthAccountRepository implements IOAuthAccountRepository {
	async findByProviderAndAccountId(
		provider: OAuthProvider,
		providerAccountId: string,
	): Promise<{
		userId: string;
		accessToken: string | null;
		tokenScope: string | null;
	} | null> {
		const account = await db.query.oauthAccounts.findFirst({
			where: and(
				eq(oauthAccounts.provider, provider),
				eq(oauthAccounts.providerAccountId, providerAccountId),
			),
		});

		if (!account) return null;

		return {
			userId: account.userId,
			accessToken: decryptStoredToken(account.accessToken),
			tokenScope: account.tokenScope,
		};
	}

	async findByUserId(
		userId: string,
		provider: OAuthProvider,
	): Promise<{ accessToken: string | null; tokenScope: string | null } | null> {
		const account = await db.query.oauthAccounts.findFirst({
			where: and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)),
		});

		if (!account) return null;

		return {
			accessToken: decryptStoredToken(account.accessToken),
			tokenScope: account.tokenScope,
		};
	}

	async create(data: {
		userId: string;
		provider: OAuthProvider;
		providerAccountId: string;
		email: string;
		accessToken?: string;
		tokenScope?: string;
	}): Promise<void> {
		await db.insert(oauthAccounts).values({
			userId: data.userId,
			provider: data.provider,
			providerAccountId: data.providerAccountId,
			email: data.email,
			accessToken: data.accessToken ? encryptToken(data.accessToken) : undefined,
			tokenScope: data.tokenScope,
		});
	}

	async updateToken(
		userId: string,
		provider: OAuthProvider,
		accessToken: string,
		tokenScope: string,
	): Promise<void> {
		await db
			.update(oauthAccounts)
			.set({
				accessToken: encryptToken(accessToken),
				tokenScope,
			})
			.where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)));
	}
}

// ============================================================================
// Capabilities Repository Implementation
// ============================================================================

export class DrizzleCapabilitiesRepository implements ICapabilitiesRepository {
	async getEffectiveCapabilities(userId: string): Promise<Capability[]> {
		// Single query to get both user capabilities and role capabilities
		const result = await db
			.select({
				userCapabilities: users.capabilities,
				roleCapabilities: roles.capabilities,
			})
			.from(users)
			.leftJoin(roleAssignments, eq(roleAssignments.userId, users.id))
			.leftJoin(roles, eq(roles.id, roleAssignments.roleId))
			.where(eq(users.id, userId));

		if (result.length === 0) {
			return [];
		}

		// Extract user capabilities (same for all rows)
		const directCapabilities = (result[0]?.userCapabilities || []) as Capability[];

		// Collect all role capabilities from all rows
		const roleCapabilities = result
			.map((r) => r.roleCapabilities)
			.filter((caps): caps is Capability[] => caps !== null && Array.isArray(caps))
			.flat() as Capability[];

		// Union of direct capabilities and role capabilities
		const effectiveCapabilities = Array.from(
			new Set<Capability>([...directCapabilities, ...roleCapabilities]),
		);

		return effectiveCapabilities;
	}

	async getBulkEffectiveCapabilities(userIds: string[]): Promise<Record<string, Capability[]>> {
		if (userIds.length === 0) {
			return {};
		}

		// Single query to get all user capabilities and role capabilities for all users
		const result = await db
			.select({
				userId: users.id,
				userCapabilities: users.capabilities,
				roleCapabilities: roles.capabilities,
			})
			.from(users)
			.leftJoin(roleAssignments, eq(roleAssignments.userId, users.id))
			.leftJoin(roles, eq(roles.id, roleAssignments.roleId))
			.where(inArray(users.id, userIds));

		// Group results by userId
		const userCapabilitiesMap: Record<string, Capability[]> = {};
		const userRoleCapabilitiesMap: Record<string, Capability[]> = {};

		for (const row of result) {
			const userId = row.userId;

			// Store direct capabilities (same for all rows of the same user)
			if (!userCapabilitiesMap[userId]) {
				userCapabilitiesMap[userId] = (row.userCapabilities || []) as Capability[];
			}

			// Collect role capabilities
			if (row.roleCapabilities && Array.isArray(row.roleCapabilities)) {
				if (!userRoleCapabilitiesMap[userId]) {
					userRoleCapabilitiesMap[userId] = [];
				}
				userRoleCapabilitiesMap[userId].push(...(row.roleCapabilities as Capability[]));
			}
		}

		// Compute effective capabilities for each user
		const effectiveCapabilitiesMap: Record<string, Capability[]> = {};

		for (const userId of userIds) {
			const directCapabilities = userCapabilitiesMap[userId] || [];
			const roleCapabilities = userRoleCapabilitiesMap[userId] || [];

			// Union of direct capabilities and role capabilities
			const effectiveCapabilities = Array.from(
				new Set<Capability>([...directCapabilities, ...roleCapabilities]),
			);

			effectiveCapabilitiesMap[userId] = effectiveCapabilities;
		}

		return effectiveCapabilitiesMap;
	}
}

// ============================================================================
// Repository Factory
// ============================================================================

/**
 * Create all repository instances
 */
export function createRepositories() {
	return {
		userRepository: new DrizzleUserRepository(),
		oauthAccountRepository: new DrizzleOAuthAccountRepository(),
		capabilitiesRepository: new DrizzleCapabilitiesRepository(),
	};
}
