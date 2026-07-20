import { db } from '~/db/client';
import {
	showcases,
	users,
	auditLogs,
	type ShowcaseStatus,
	type ShowcaseUseCase,
} from '~/db/schema';
import { and, eq, or, sql, desc, arrayContains, isNotNull, arrayOverlaps } from 'drizzle-orm';
import { requireCapability } from './auth.server';
import { getEffectiveCapabilities } from './capabilities.server';
import { libraryIds } from '~/libraries/ids';
import { SHOWCASE_USE_CASES } from '~/db/types';
import { getTrancoRank } from './tranco.server';
import { notifyModerators, formatShowcaseSubmittedEmail } from './email.server';

// Valid library IDs for validation
export const validLibraryIds = [...libraryIds] as string[];

// Valid use cases for validation
export const validUseCases = [...SHOWCASE_USE_CASES] as string[];

/**
 * Require the user to have the moderate-showcases capability
 */
export async function requireModerateShowcases() {
	return await requireCapability({
		data: { capability: 'moderate-showcases' },
	});
}

/**
 * Check if the user can moderate showcases (has moderate-showcases or admin capability)
 */
export async function canModerateShowcases(userId: string): Promise<boolean> {
	const capabilities = await getEffectiveCapabilities(userId);
	return capabilities.includes('moderate-showcases') || capabilities.includes('admin');
}

/**
 * Validate that user owns the showcase
 */
export async function validateShowcaseOwnership(showcaseId: string, userId: string): Promise<void> {
	const showcase = await db.query.showcases.findFirst({
		where: eq(showcases.id, showcaseId),
	});

	if (!showcase) {
		throw new Error('Showcase not found');
	}

	if (showcase.userId !== userId) {
		throw new Error('You do not have permission to modify this showcase');
	}
}

/**
 * Check if user has reached the pending submission limit
 * Returns true if limit is reached, false otherwise
 */
export async function checkPendingSubmissionLimit(userId: string): Promise<boolean> {
	// Limit: 5 pending submissions max
	const pendingSubmissions = await db
		.select({ count: sql<number>`COUNT(*)::int` })
		.from(showcases)
		.where(and(eq(showcases.userId, userId), eq(showcases.status, 'pending')));

	const count = pendingSubmissions[0]?.count ?? 0;
	return count >= 5;
}

/**
 * Library dependencies: Start automatically includes Router
 */
export function expandLibraryDependencies(libraries: string[]): string[] {
	const expanded = new Set(libraries);

	// If 'start' is selected, automatically include 'router'
	if (expanded.has('start')) {
		expanded.add('router');
	}

	return Array.from(expanded);
}

/**
 * Get libraries that are auto-included (for UI display)
 */
export function getAutoIncludedLibraries(selectedLibraries: string[]): Record<string, string> {
	const autoIncluded: Record<string, string> = {};

	if (selectedLibraries.includes('start')) {
		autoIncluded['router'] = 'Included via Start';
	}

	return autoIncluded;
}

/**
 * Valid URL check (basic format validation)
 */
export function isValidUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Validate library IDs
 */
export function validateLibraryIds(libraries: string[]): void {
	const invalid = libraries.filter((lib) => !validLibraryIds.includes(lib));
	if (invalid.length > 0) {
		throw new Error(
			`Invalid library IDs: ${invalid.join(', ')}. Valid IDs: ${validLibraryIds.join(', ')}`,
		);
	}
}

/**
 * Validate use cases
 */
export function validateUseCases(useCases: string[]): void {
	const invalid = useCases.filter((uc) => !validUseCases.includes(uc));
	if (invalid.length > 0) {
		throw new Error(
			`Invalid use cases: ${invalid.join(', ')}. Valid use cases: ${validUseCases.join(', ')}`,
		);
	}
}

/**
 * Validate URLs in showcase data
 */
export function validateShowcaseUrls(data: {
	url: string;
	screenshotUrl: string;
	logoUrl?: string | null;
	sourceUrl?: string | null;
}): void {
	if (!isValidUrl(data.url)) {
		throw new Error('Invalid URL format');
	}
	if (!isValidUrl(data.screenshotUrl)) {
		throw new Error('Invalid screenshot URL format');
	}
	if (data.logoUrl && !isValidUrl(data.logoUrl)) {
		throw new Error('Invalid logo URL format');
	}
	if (data.sourceUrl && !isValidUrl(data.sourceUrl)) {
		throw new Error('Invalid source code URL format');
	}
}

// ============================================================================
// Core Operations - Accept userId directly, usable by both UI and MCP
// ============================================================================

export interface SubmitShowcaseData {
	name: string;
	tagline: string;
	description?: string;
	url: string;
	logoUrl?: string;
	screenshotUrl: string;
	sourceUrl?: string;
	libraries: string[];
	useCases: string[];
}

export interface SubmitShowcaseOptions {
	userId: string;
	source?: 'web' | 'mcp';
}

/**
 * Core: Submit a new showcase
 */
export async function submitShowcaseCore(data: SubmitShowcaseData, options: SubmitShowcaseOptions) {
	const { userId, source = 'web' } = options;

	// Check pending submission limit
	const limitReached = await checkPendingSubmissionLimit(userId);
	if (limitReached) {
		throw new Error(
			'You have reached the limit of 5 pending submissions. Please wait for existing submissions to be reviewed.',
		);
	}

	// Validate URLs
	validateShowcaseUrls({
		url: data.url,
		screenshotUrl: data.screenshotUrl,
		logoUrl: data.logoUrl,
		sourceUrl: data.sourceUrl,
	});

	// Validate library IDs
	validateLibraryIds(data.libraries);

	// Validate use cases
	if (data.useCases.length > 0) {
		validateUseCases(data.useCases);
	}

	// Expand library dependencies (e.g., Start includes Router)
	const expandedLibraries = expandLibraryDependencies(data.libraries);

	// Fetch Tranco rank for popularity sorting
	const trancoRank = await getTrancoRank(data.url);

	// Create showcase
	const [newShowcase] = await db
		.insert(showcases)
		.values({
			userId,
			name: data.name,
			tagline: data.tagline,
			description: data.description,
			url: data.url,
			logoUrl: data.logoUrl,
			screenshotUrl: data.screenshotUrl,
			sourceUrl: data.sourceUrl,
			libraries: expandedLibraries,
			useCases: data.useCases as ShowcaseUseCase[],
			status: 'pending',
			trancoRank,
			trancoRankUpdatedAt: trancoRank ? new Date() : null,
		})
		.returning();

	// Log the creation
	await db.insert(auditLogs).values({
		actorId: userId,
		action: 'showcase.create',
		targetType: 'showcase',
		targetId: newShowcase.id,
		details: {
			name: data.name,
			url: data.url,
			libraries: expandedLibraries,
			source,
		},
	});

	// Notify moderators of new submission
	const [userRecord] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	notifyModerators({
		capability: 'moderate-showcases',
		...formatShowcaseSubmittedEmail({
			name: data.name,
			url: data.url,
			tagline: data.tagline,
			libraries: expandedLibraries,
			userName: userRecord?.name || undefined,
		}),
	});

	return {
		id: newShowcase.id,
		status: newShowcase.status,
	};
}

export interface UpdateShowcaseData {
	showcaseId: string;
	name: string;
	tagline: string;
	description?: string;
	url: string;
	logoUrl?: string;
	screenshotUrl: string;
	sourceUrl?: string | null;
	libraries: string[];
	useCases: string[];
}

export interface UpdateShowcaseOptions {
	userId: string;
	source?: 'web' | 'mcp';
}

/**
 * Core: Update an existing showcase (resets to pending)
 */
export async function updateShowcaseCore(data: UpdateShowcaseData, options: UpdateShowcaseOptions) {
	const { userId, source = 'web' } = options;

	// Validate ownership
	await validateShowcaseOwnership(data.showcaseId, userId);

	// Validate URLs
	validateShowcaseUrls({
		url: data.url,
		screenshotUrl: data.screenshotUrl,
		logoUrl: data.logoUrl,
		sourceUrl: data.sourceUrl,
	});

	// Validate library IDs
	validateLibraryIds(data.libraries);

	// Validate use cases
	if (data.useCases.length > 0) {
		validateUseCases(data.useCases);
	}

	// Expand library dependencies
	const expandedLibraries = expandLibraryDependencies(data.libraries);

	// Get existing showcase for audit log and URL comparison
	const [existing] = await db
		.select()
		.from(showcases)
		.where(eq(showcases.id, data.showcaseId))
		.limit(1);

	// Re-fetch Tranco rank if URL changed
	const urlChanged = existing?.url !== data.url;
	const trancoRank = urlChanged ? await getTrancoRank(data.url) : existing?.trancoRank;

	// Update showcase - edits reset to pending
	await db
		.update(showcases)
		.set({
			name: data.name,
			tagline: data.tagline,
			description: data.description,
			url: data.url,
			logoUrl: data.logoUrl,
			screenshotUrl: data.screenshotUrl,
			sourceUrl: data.sourceUrl ?? null,
			libraries: expandedLibraries,
			useCases: data.useCases as ShowcaseUseCase[],
			status: 'pending',
			moderatedBy: null,
			moderatedAt: null,
			moderationNote: null,
			updatedAt: new Date(),
			...(urlChanged && {
				trancoRank,
				trancoRankUpdatedAt: trancoRank ? new Date() : null,
			}),
		})
		.where(eq(showcases.id, data.showcaseId));

	// Log the update
	await db.insert(auditLogs).values({
		actorId: userId,
		action: 'showcase.update',
		targetType: 'showcase',
		targetId: data.showcaseId,
		details: {
			before: existing,
			after: {
				name: data.name,
				url: data.url,
				libraries: expandedLibraries,
			},
			source,
		},
	});

	return { success: true };
}

export interface DeleteShowcaseOptions {
	userId: string;
	source?: 'web' | 'mcp';
}

/**
 * Core: Delete a showcase
 */
export async function deleteShowcaseCore(showcaseId: string, options: DeleteShowcaseOptions) {
	const { userId, source = 'web' } = options;

	// Validate ownership
	await validateShowcaseOwnership(showcaseId, userId);

	// Get existing for audit log
	const [existing] = await db.select().from(showcases).where(eq(showcases.id, showcaseId)).limit(1);

	// Delete showcase
	await db.delete(showcases).where(eq(showcases.id, showcaseId));

	// Log the deletion
	await db.insert(auditLogs).values({
		actorId: userId,
		action: 'showcase.delete',
		targetType: 'showcase',
		targetId: showcaseId,
		details: { deleted: existing, source },
	});

	return { success: true };
}

export interface GetMyShowcasesOptions {
	userId: string;
	pagination?: {
		page?: number;
		pageSize?: number;
	};
	status?: ShowcaseStatus;
}

/**
 * Core: Get user's own showcases
 */
export async function getMyShowcasesCore(options: GetMyShowcasesOptions) {
	const { userId, pagination = {}, status } = options;
	const page = pagination.page ?? 1;
	const pageSize = pagination.pageSize ?? 20;

	// Build where conditions
	const conditions = [eq(showcases.userId, userId)];

	if (status) {
		conditions.push(eq(showcases.status, status));
	}

	const whereClause = and(...conditions);

	// Get total count
	const [countResult] = await db
		.select({ count: sql<number>`COUNT(*)::int` })
		.from(showcases)
		.where(whereClause);

	const total = countResult?.count ?? 0;

	// Get paginated results
	const offset = (page - 1) * pageSize;
	const showcaseList = await db
		.select()
		.from(showcases)
		.where(whereClause)
		.orderBy(desc(showcases.createdAt))
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
}

export interface SearchShowcasesFilters {
	libraryIds?: string[];
	useCases?: string[];
	featured?: boolean;
	hasSourceCode?: boolean;
	q?: string;
}

export interface SearchShowcasesOptions {
	filters?: SearchShowcasesFilters;
	pagination?: {
		page?: number;
		pageSize?: number;
	};
}

/**
 * Core: Search/filter approved showcases (public)
 */
export async function searchShowcasesCore(options: SearchShowcasesOptions = {}) {
	const { filters = {}, pagination = {} } = options;
	const page = pagination.page ?? 1;
	const pageSize = pagination.pageSize ?? 24;

	// Build where conditions
	const conditions = [eq(showcases.status, 'approved' as ShowcaseStatus)];

	if (filters.libraryIds && filters.libraryIds.length > 0) {
		conditions.push(
			or(...filters.libraryIds.map((libId) => arrayContains(showcases.libraries, [libId])))!,
		);
	}

	if (filters.useCases && filters.useCases.length > 0) {
		conditions.push(arrayOverlaps(showcases.useCases, filters.useCases as ShowcaseUseCase[]));
	}

	if (filters.featured !== undefined) {
		conditions.push(eq(showcases.isFeatured, filters.featured));
	}

	if (filters.hasSourceCode === true) {
		conditions.push(isNotNull(showcases.sourceUrl));
	}

	if (filters.q && filters.q.trim()) {
		const searchTerm = `%${filters.q.trim().toLowerCase()}%`;
		conditions.push(
			sql`(
        LOWER(${showcases.name}) LIKE ${searchTerm} OR
        LOWER(${showcases.tagline}) LIKE ${searchTerm} OR
        LOWER(COALESCE(${showcases.description}, '')) LIKE ${searchTerm} OR
        LOWER(${showcases.url}) LIKE ${searchTerm}
      )`,
		);
	}

	const whereClause = and(...conditions);

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
				image: users.image,
			},
		})
		.from(showcases)
		.leftJoin(users, eq(showcases.userId, users.id))
		.where(whereClause)
		.orderBy(
			desc(showcases.isFeatured),
			desc(showcases.voteScore),
			sql`${showcases.trancoRank} ASC NULLS LAST`,
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
}

export interface GetShowcaseOptions {
	userId?: string; // Optional - for checking ownership of non-approved showcases
}

/**
 * Core: Get a single showcase by ID
 * Public if approved, or owner can see their own
 */
export async function getShowcaseCore(showcaseId: string, options: GetShowcaseOptions = {}) {
	const { userId } = options;

	const [result] = await db
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
		.where(eq(showcases.id, showcaseId))
		.limit(1);

	if (!result) {
		throw new Error('Showcase not found');
	}

	// Check access: public if approved, or owner can see their own
	if (result.showcase.status !== 'approved' && result.showcase.userId !== userId) {
		throw new Error('Showcase not found');
	}

	return { showcase: result.showcase, user: result.user };
}
