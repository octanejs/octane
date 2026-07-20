import { createServerFn } from '@tanstack/react-start';
import * as v from 'valibot';
import { db } from '~/db/client';
import { showcases, showcaseVotes, users, auditLogs, type ShowcaseStatus } from '~/db/schema';
import { eq, and, or, sql, desc, inArray, arrayContains } from 'drizzle-orm';
import { getAuthenticatedUser } from './auth.server-helpers';
import {
	requireModerateShowcases,
	expandLibraryDependencies,
	isValidUrl,
	validLibraryIds,
	// Core operations
	submitShowcaseCore,
	updateShowcaseCore,
	deleteShowcaseCore,
	getMyShowcasesCore,
	searchShowcasesCore,
	getShowcaseCore,
} from './showcase.server';
import { getTrancoRank } from './tranco.server';
import {
	pageNumberSchema,
	pageSizeSchema,
	showcaseUseCaseSchema,
	showcaseStatusSchema,
} from './schemas';

const showcaseLimitSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24));
const showcaseTextSchema = (maxLength: number) =>
	v.pipe(v.string(), v.minLength(1), v.maxLength(maxLength));
const optionalShowcaseTextSchema = (maxLength: number) =>
	v.optional(v.pipe(v.string(), v.maxLength(maxLength)));
const optionalNullableShowcaseTextSchema = (maxLength: number) =>
	v.optional(v.nullable(v.pipe(v.string(), v.maxLength(maxLength))));
const showcaseUrlSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(2048));
const optionalShowcaseUrlSchema = v.optional(v.pipe(v.string(), v.maxLength(2048)));
const optionalNullableShowcaseUrlSchema = v.optional(
	v.nullable(v.pipe(v.string(), v.maxLength(2048))),
);
const showcaseLibrariesSchema = v.pipe(
	v.array(v.pipe(v.string(), v.maxLength(64))),
	v.minLength(1, 'At least one library is required'),
	v.maxLength(16),
);
const optionalShowcaseUseCasesSchema = v.optional(
	v.pipe(v.array(showcaseUseCaseSchema), v.maxLength(12)),
	[],
);
const showcaseUseCasesSchema = v.pipe(v.array(showcaseUseCaseSchema), v.maxLength(12));

/**
 * Submit a new showcase
 */
export const submitShowcase = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			name: showcaseTextSchema(255),
			tagline: showcaseTextSchema(500),
			description: optionalShowcaseTextSchema(4000),
			url: showcaseUrlSchema,
			logoUrl: optionalShowcaseUrlSchema,
			screenshotUrl: showcaseUrlSchema,
			sourceUrl: optionalShowcaseUrlSchema,
			libraries: showcaseLibrariesSchema,
			useCases: optionalShowcaseUseCasesSchema,
		}),
	)
	.handler(async ({ data }) => {
		const user = await getAuthenticatedUser();

		if (!user) {
			throw new Error('Authentication required');
		}

		const result = await submitShowcaseCore(
			{
				name: data.name,
				tagline: data.tagline,
				description: data.description,
				url: data.url,
				logoUrl: data.logoUrl,
				screenshotUrl: data.screenshotUrl,
				sourceUrl: data.sourceUrl,
				libraries: data.libraries,
				useCases: data.useCases ?? [],
			},
			{ userId: user.userId, source: 'web' },
		);

		return {
			success: true,
			showcaseId: result.id,
		};
	});

/**
 * Update an existing showcase (resets to pending)
 */
export const updateShowcase = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			showcaseId: v.pipe(v.string(), v.uuid()),
			name: showcaseTextSchema(255),
			tagline: showcaseTextSchema(500),
			description: optionalShowcaseTextSchema(4000),
			url: showcaseUrlSchema,
			logoUrl: optionalShowcaseUrlSchema,
			screenshotUrl: showcaseUrlSchema,
			sourceUrl: optionalShowcaseUrlSchema,
			libraries: showcaseLibrariesSchema,
			useCases: optionalShowcaseUseCasesSchema,
		}),
	)
	.handler(async ({ data }) => {
		const user = await getAuthenticatedUser();

		if (!user) {
			throw new Error('Authentication required');
		}

		return await updateShowcaseCore(
			{
				showcaseId: data.showcaseId,
				name: data.name,
				tagline: data.tagline,
				description: data.description,
				url: data.url,
				logoUrl: data.logoUrl,
				screenshotUrl: data.screenshotUrl,
				sourceUrl: data.sourceUrl,
				libraries: data.libraries,
				useCases: data.useCases ?? [],
			},
			{ userId: user.userId, source: 'web' },
		);
	});

/**
 * Delete a showcase
 */
export const deleteShowcase = createServerFn({ method: 'POST' })
	.validator(v.object({ showcaseId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		const user = await getAuthenticatedUser();

		if (!user) {
			throw new Error('Authentication required');
		}

		return await deleteShowcaseCore(data.showcaseId, {
			userId: user.userId,
			source: 'web',
		});
	});

/**
 * Get user's own showcases
 */
export const getMyShowcases = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			pagination: v.object({
				page: v.optional(pageNumberSchema, 1),
				pageSize: v.optional(pageSizeSchema, 20),
			}),
		}),
	)
	.handler(async ({ data }) => {
		const user = await getAuthenticatedUser();

		if (!user) {
			throw new Error('Authentication required');
		}

		return await getMyShowcasesCore({
			userId: user.userId,
			pagination: data.pagination,
		});
	});

/**
 * Get approved showcases (public)
 */
export const getApprovedShowcases = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			pagination: v.object({
				page: v.optional(pageNumberSchema, 1),
				pageSize: v.optional(pageSizeSchema, 24),
			}),
			filters: v.optional(
				v.object({
					libraryIds: v.optional(
						v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(16)),
					),
					useCases: v.optional(v.pipe(v.array(showcaseUseCaseSchema), v.maxLength(12))),
					featured: v.optional(v.boolean()),
					hasSourceCode: v.optional(v.boolean()),
					q: v.optional(v.pipe(v.string(), v.maxLength(120))),
				}),
			),
		}),
	)
	.handler(async ({ data }) => {
		return await searchShowcasesCore({
			pagination: data.pagination,
			filters: data.filters,
		});
	});

/**
 * Get showcases by library (public)
 */
export const getShowcasesByLibrary = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			libraryId: v.pipe(v.string(), v.maxLength(64)),
			limit: v.optional(showcaseLimitSchema, 6),
		}),
	)
	.handler(async ({ data }) => {
		const result = await searchShowcasesCore({
			filters: { libraryIds: [data.libraryId] },
			pagination: { page: 1, pageSize: data.limit },
		});
		return { showcases: result.showcases };
	});

/**
 * Get featured showcases (public, for homepage)
 * Shows featured first, then by popularity (Tranco rank), then by date
 */
export const getFeaturedShowcases = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			limit: v.optional(showcaseLimitSchema, 6),
		}),
	)
	.handler(async ({ data }) => {
		const result = await searchShowcasesCore({
			pagination: { page: 1, pageSize: data.limit },
		});
		return { showcases: result.showcases };
	});

/**
 * List showcases for moderation (moderate-showcases capability required)
 */
export const listShowcasesForModeration = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			pagination: v.object({
				page: v.optional(pageNumberSchema, 1),
				pageSize: v.optional(pageSizeSchema, 50),
			}),
			filters: v.optional(
				v.object({
					status: v.optional(v.pipe(v.array(showcaseStatusSchema), v.maxLength(3))),
					libraryId: v.optional(
						v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(16)),
					),
					userId: v.optional(v.pipe(v.string(), v.uuid())),
					isFeatured: v.optional(v.boolean()),
				}),
			),
		}),
	)
	.handler(async ({ data }) => {
		await requireModerateShowcases();

		const { page, pageSize } = data.pagination;
		const filters = data.filters ?? {};

		// Build where conditions
		const conditions = [];

		if (filters.status && filters.status.length > 0) {
			conditions.push(inArray(showcases.status, filters.status as ShowcaseStatus[]));
		}

		if (filters.libraryId && filters.libraryId.length > 0) {
			// Match showcases that have ANY of the selected libraries
			conditions.push(
				or(...filters.libraryId.map((libId) => arrayContains(showcases.libraries, [libId])))!,
			);
		}

		if (filters.userId) {
			conditions.push(eq(showcases.userId, filters.userId));
		}

		if (filters.isFeatured !== undefined) {
			conditions.push(eq(showcases.isFeatured, filters.isFeatured));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Get total count
		const [countResult] = await db
			.select({ count: sql<number>`COUNT(*)::int` })
			.from(showcases)
			.where(whereClause);

		const total = countResult?.count ?? 0;

		// Get paginated results with user info
		const offset = (page - 1) * pageSize;
		const showcaseList = await db
			.select({
				showcase: showcases,
				user: {
					id: users.id,
					name: users.name,
					email: users.email,
					image: users.image,
				},
			})
			.from(showcases)
			.leftJoin(users, eq(showcases.userId, users.id))
			.where(whereClause)
			.orderBy(
				sql`CASE ${showcases.status} WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'denied' THEN 2 END`,
				desc(showcases.createdAt),
			)
			.limit(pageSize)
			.offset(offset);

		return {
			showcases: showcaseList,
			pagination: {
				page,
				pageSize,
				total,
				totalPages: Math.ceil(total / pageSize),
			},
		};
	});

/**
 * Moderate a showcase (approve or deny)
 */
export const moderateShowcase = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			showcaseId: v.pipe(v.string(), v.uuid()),
			action: v.picklist(['approve', 'deny']),
			moderationNote: optionalShowcaseTextSchema(1000),
		}),
	)
	.handler(async ({ data }) => {
		const moderator = await requireModerateShowcases();

		// Get existing for audit log
		const existing = await db
			.select()
			.from(showcases)
			.where(eq(showcases.id, data.showcaseId))
			.limit(1);

		if (!existing[0]) {
			throw new Error('Showcase not found');
		}

		const status: ShowcaseStatus = data.action === 'approve' ? 'approved' : 'denied';

		await db
			.update(showcases)
			.set({
				status,
				moderatedBy: moderator.userId,
				moderatedAt: new Date(),
				moderationNote: data.moderationNote,
				updatedAt: new Date(),
			})
			.where(eq(showcases.id, data.showcaseId));

		// Log the moderation
		await db.insert(auditLogs).values({
			actorId: moderator.userId,
			action: 'showcase.moderate',
			targetType: 'showcase',
			targetId: data.showcaseId,
			details: {
				action: data.action,
				moderationNote: data.moderationNote,
				before: { status: existing[0].status },
				after: { status },
			},
		});

		return { success: true };
	});

/**
 * Set featured status for a showcase
 */
export const setShowcaseFeatured = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			showcaseId: v.pipe(v.string(), v.uuid()),
			isFeatured: v.boolean(),
		}),
	)
	.handler(async ({ data }) => {
		const moderator = await requireModerateShowcases();

		// Get existing for audit log
		const existing = await db
			.select()
			.from(showcases)
			.where(eq(showcases.id, data.showcaseId))
			.limit(1);

		if (!existing[0]) {
			throw new Error('Showcase not found');
		}

		await db
			.update(showcases)
			.set({
				isFeatured: data.isFeatured,
				updatedAt: new Date(),
			})
			.where(eq(showcases.id, data.showcaseId));

		// Log the change
		await db.insert(auditLogs).values({
			actorId: moderator.userId,
			action: 'showcase.moderate',
			targetType: 'showcase',
			targetId: data.showcaseId,
			details: {
				action: 'set_featured',
				before: { isFeatured: existing[0].isFeatured },
				after: { isFeatured: data.isFeatured },
			},
		});

		return { success: true };
	});

/**
 * Get a single showcase by ID (public for approved, owner for any status)
 */
export const getShowcase = createServerFn({ method: 'POST' })
	.validator(v.object({ showcaseId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		let user;
		try {
			user = await getAuthenticatedUser();
		} catch {
			// User not authenticated, that's okay for approved showcases
		}

		return await getShowcaseCore(data.showcaseId, { userId: user?.userId });
	});

/**
 * Get a single showcase by ID for admin (moderate-showcases capability required)
 */
export const adminGetShowcase = createServerFn({ method: 'POST' })
	.validator(v.object({ showcaseId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		await requireModerateShowcases();

		const [result] = await db
			.select({
				showcase: showcases,
				user: {
					id: users.id,
					name: users.name,
					email: users.email,
					image: users.image,
				},
			})
			.from(showcases)
			.leftJoin(users, eq(showcases.userId, users.id))
			.where(eq(showcases.id, data.showcaseId))
			.limit(1);

		if (!result) {
			return null;
		}

		return { showcase: result.showcase, user: result.user };
	});

/**
 * Admin update a showcase (moderate-showcases capability required)
 * Allows editing all fields without resetting status
 */
export const adminUpdateShowcase = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			showcaseId: v.pipe(v.string(), v.uuid()),
			name: showcaseTextSchema(255),
			tagline: showcaseTextSchema(500),
			description: optionalNullableShowcaseTextSchema(4000),
			url: showcaseUrlSchema,
			logoUrl: optionalNullableShowcaseUrlSchema,
			screenshotUrl: showcaseUrlSchema,
			sourceUrl: optionalNullableShowcaseUrlSchema,
			libraries: showcaseLibrariesSchema,
			useCases: showcaseUseCasesSchema,
			status: showcaseStatusSchema,
			isFeatured: v.boolean(),
			moderationNote: optionalNullableShowcaseTextSchema(1000),
			trancoRank: v.optional(v.nullable(v.pipe(v.number(), v.minValue(1)))),
			voteScore: v.pipe(v.number(), v.integer()),
		}),
	)
	.handler(async ({ data }) => {
		const moderator = await requireModerateShowcases();

		// Validate URL format
		if (!isValidUrl(data.url)) {
			throw new Error('Invalid URL format');
		}

		if (data.logoUrl && !isValidUrl(data.logoUrl)) {
			throw new Error('Invalid logo URL format');
		}

		if (data.sourceUrl && !isValidUrl(data.sourceUrl)) {
			throw new Error('Invalid source code URL format');
		}

		if (!isValidUrl(data.screenshotUrl)) {
			throw new Error('Invalid screenshot URL format');
		}

		// Validate library IDs
		const invalidLibraries = data.libraries.filter((lib) => !validLibraryIds.includes(lib));
		if (invalidLibraries.length > 0) {
			throw new Error(`Invalid library IDs: ${invalidLibraries.join(', ')}`);
		}

		// Get existing for audit log
		const existing = await db
			.select()
			.from(showcases)
			.where(eq(showcases.id, data.showcaseId))
			.limit(1);

		if (!existing[0]) {
			throw new Error('Showcase not found');
		}

		// Expand library dependencies
		const expandedLibraries = expandLibraryDependencies(data.libraries);

		// Check if URL changed for Tranco rank update
		const urlChanged = existing[0].url !== data.url;
		let trancoRank = data.trancoRank;
		if (urlChanged) {
			trancoRank = await getTrancoRank(data.url);
		}

		// Update showcase
		await db
			.update(showcases)
			.set({
				name: data.name,
				tagline: data.tagline,
				description: data.description ?? null,
				url: data.url,
				logoUrl: data.logoUrl ?? null,
				screenshotUrl: data.screenshotUrl,
				sourceUrl: data.sourceUrl ?? null,
				libraries: expandedLibraries,
				useCases: data.useCases,
				status: data.status,
				isFeatured: data.isFeatured,
				moderationNote: data.moderationNote ?? null,
				moderatedBy: moderator.userId,
				moderatedAt: new Date(),
				voteScore: data.voteScore,
				trancoRank: trancoRank ?? null,
				trancoRankUpdatedAt:
					urlChanged && trancoRank ? new Date() : existing[0].trancoRankUpdatedAt,
				updatedAt: new Date(),
			})
			.where(eq(showcases.id, data.showcaseId));

		// Log the update
		await db.insert(auditLogs).values({
			actorId: moderator.userId,
			action: 'showcase.update',
			targetType: 'showcase',
			targetId: data.showcaseId,
			details: {
				updatedBy: 'admin',
				before: existing[0],
				after: {
					name: data.name,
					tagline: data.tagline,
					url: data.url,
					libraries: expandedLibraries,
					status: data.status,
					isFeatured: data.isFeatured,
					voteScore: data.voteScore,
				},
			},
		});

		return { success: true };
	});

/**
 * Admin delete a showcase (moderate-showcases capability required)
 */
export const adminDeleteShowcase = createServerFn({ method: 'POST' })
	.validator(v.object({ showcaseId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		const moderator = await requireModerateShowcases();

		// Get existing for audit log
		const existing = await db
			.select()
			.from(showcases)
			.where(eq(showcases.id, data.showcaseId))
			.limit(1);

		if (!existing[0]) {
			throw new Error('Showcase not found');
		}

		// Delete showcase
		await db.delete(showcases).where(eq(showcases.id, data.showcaseId));

		// Log the deletion
		await db.insert(auditLogs).values({
			actorId: moderator.userId,
			action: 'showcase.delete',
			targetType: 'showcase',
			targetId: data.showcaseId,
			details: { deleted: existing[0], deletedBy: 'moderator' },
		});

		return { success: true };
	});

/**
 * Vote on a showcase (upvote or downvote)
 * If user already voted with the same value, removes the vote (toggle off)
 * If user voted with different value, updates to new value
 */
export const voteShowcase = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			showcaseId: v.pipe(v.string(), v.uuid()),
			value: v.picklist([1, -1]),
		}),
	)
	.handler(async ({ data }) => {
		const user = await getAuthenticatedUser();

		if (!user) {
			throw new Error('Authentication required');
		}

		// Check showcase exists and is approved
		const [showcase] = await db
			.select({ id: showcases.id, status: showcases.status })
			.from(showcases)
			.where(eq(showcases.id, data.showcaseId))
			.limit(1);

		if (!showcase) {
			throw new Error('Showcase not found');
		}

		if (showcase.status !== 'approved') {
			throw new Error('Can only vote on approved showcases');
		}

		// Check for existing vote
		const [existingVote] = await db
			.select()
			.from(showcaseVotes)
			.where(
				and(eq(showcaseVotes.showcaseId, data.showcaseId), eq(showcaseVotes.userId, user.userId)),
			)
			.limit(1);

		if (existingVote) {
			if (existingVote.value === data.value) {
				// Same vote, toggle off (remove)
				await db.delete(showcaseVotes).where(eq(showcaseVotes.id, existingVote.id));
			} else {
				// Different vote, update
				await db
					.update(showcaseVotes)
					.set({ value: data.value, updatedAt: new Date() })
					.where(eq(showcaseVotes.id, existingVote.id));
			}
		} else {
			// No existing vote, insert new one
			await db.insert(showcaseVotes).values({
				showcaseId: data.showcaseId,
				userId: user.userId,
				value: data.value,
			});
		}

		// Recalculate and update voteScore
		const [scoreResult] = await db
			.select({
				score: sql<number>`COALESCE(SUM(${showcaseVotes.value}), 0)::int`,
			})
			.from(showcaseVotes)
			.where(eq(showcaseVotes.showcaseId, data.showcaseId));

		await db
			.update(showcases)
			.set({ voteScore: scoreResult?.score ?? 0 })
			.where(eq(showcases.id, data.showcaseId));

		return { success: true, voteScore: scoreResult?.score ?? 0 };
	});

/**
 * Get current user's votes for a batch of showcases
 */
export const getMyShowcaseVotes = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			showcaseIds: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(100)),
		}),
	)
	.handler(async ({ data }) => {
		const user = await getAuthenticatedUser();

		if (!user) {
			return { votes: [] };
		}

		if (data.showcaseIds.length === 0) {
			return { votes: [] };
		}

		const votes = await db
			.select({
				showcaseId: showcaseVotes.showcaseId,
				value: showcaseVotes.value,
			})
			.from(showcaseVotes)
			.where(
				and(
					eq(showcaseVotes.userId, user.userId),
					inArray(showcaseVotes.showcaseId, data.showcaseIds),
				),
			);

		return { votes };
	});

/**
 * Get related showcases (same libraries, excluding current showcase)
 */
export const getRelatedShowcases = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			showcaseId: v.pipe(v.string(), v.uuid()),
			libraries: v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(16)),
			limit: v.optional(showcaseLimitSchema, 4),
		}),
	)
	.handler(async ({ data }) => {
		if (data.libraries.length === 0) {
			return { showcases: [] };
		}

		const showcaseList = await db
			.select({
				showcase: showcases,
				user: {
					id: users.id,
					name: users.name,
					image: users.image,
				},
			})
			.from(showcases)
			.leftJoin(users, eq(showcases.userId, users.id))
			.where(
				and(
					eq(showcases.status, 'approved' as ShowcaseStatus),
					sql`${showcases.id} != ${data.showcaseId}`,
					or(...data.libraries.map((libId) => arrayContains(showcases.libraries, [libId]))),
				),
			)
			.orderBy(
				desc(showcases.isFeatured),
				desc(showcases.voteScore),
				sql`${showcases.trancoRank} ASC NULLS LAST`,
				desc(showcases.createdAt),
			)
			.limit(data.limit);

		return { showcases: showcaseList };
	});
