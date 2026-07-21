import { createServerFn } from '@octanejs/tanstack-start';
import * as v from 'valibot';
import { requireAdmin } from './roles.server';
import { db } from '~/db/client';
import { loginHistory, auditLogs, users, type AuditAction } from '~/db/schema';
import { desc, asc, eq, sql, and, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ALL_TIME_FLOOR_DATE } from './chart';
import { isoDateSchema, pageIndexSchema, pageSizeSchema } from './schemas';

const adminPaginationSchema = v.object({
	limit: pageSizeSchema,
	page: v.optional(pageIndexSchema),
});

// Query login history (admin only)
export const listLoginHistory = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			pagination: adminPaginationSchema,
			userId: v.optional(v.pipe(v.string(), v.uuid())),
			provider: v.optional(v.picklist(['github', 'google'])),
			dateFrom: v.optional(isoDateSchema),
			dateTo: v.optional(isoDateSchema),
			sortBy: v.optional(v.string()),
			sortDir: v.optional(v.picklist(['asc', 'desc'])),
		}),
	)
	.handler(async ({ data }) => {
		await requireAdmin();

		const limit = data.pagination.limit;
		const pageIndex = data.pagination.page ?? 0;
		const offset = Math.max(0, pageIndex * limit);

		const conditions = [];

		if (data.userId) {
			conditions.push(eq(loginHistory.userId, data.userId));
		}

		if (data.provider) {
			conditions.push(eq(loginHistory.provider, data.provider));
		}

		if (data.dateFrom) {
			conditions.push(gte(loginHistory.createdAt, new Date(data.dateFrom)));
		}

		if (data.dateTo) {
			conditions.push(lte(loginHistory.createdAt, new Date(data.dateTo)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Build order by clause
		const getOrderByClause = () => {
			const dir = data.sortDir === 'asc' ? asc : desc;
			switch (data.sortBy) {
				case 'createdAt':
					return dir(loginHistory.createdAt);
				default:
					return desc(loginHistory.createdAt);
			}
		};
		const orderByClause = getOrderByClause();

		// Get total count
		const [countResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(loginHistory)
			.where(whereClause);

		const totalCount = Number(countResult.count);

		// Get paginated results with user info
		const results = await db
			.select({
				id: loginHistory.id,
				userId: loginHistory.userId,
				provider: loginHistory.provider,
				ipAddress: loginHistory.ipAddress,
				userAgent: loginHistory.userAgent,
				isNewUser: loginHistory.isNewUser,
				createdAt: loginHistory.createdAt,
				userName: users.name,
				userEmail: users.email,
				userImage: users.image,
			})
			.from(loginHistory)
			.leftJoin(users, eq(loginHistory.userId, users.id))
			.where(whereClause)
			.orderBy(orderByClause)
			.limit(limit)
			.offset(offset);

		return {
			page: results.map((r) => ({
				...r,
				createdAt: r.createdAt.getTime(),
			})),
			isDone: offset + limit >= totalCount,
			counts: {
				total: totalCount,
				filtered: totalCount,
				pages: Math.max(1, Math.ceil(totalCount / limit)),
			},
		};
	});

// Query audit logs (admin only)
export const listAuditLogs = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			pagination: adminPaginationSchema,
			actorId: v.optional(v.pipe(v.string(), v.uuid())),
			action: v.optional(v.string()),
			targetType: v.optional(v.string()),
			targetId: v.optional(v.string()),
			dateFrom: v.optional(isoDateSchema),
			dateTo: v.optional(isoDateSchema),
		}),
	)
	.handler(async ({ data }) => {
		await requireAdmin();

		const limit = data.pagination.limit;
		const pageIndex = data.pagination.page ?? 0;
		const offset = Math.max(0, pageIndex * limit);

		const conditions = [];

		if (data.actorId) {
			conditions.push(eq(auditLogs.actorId, data.actorId));
		}

		if (data.action) {
			conditions.push(eq(auditLogs.action, data.action as AuditAction));
		}

		if (data.targetType) {
			conditions.push(eq(auditLogs.targetType, data.targetType));
		}

		if (data.targetId) {
			conditions.push(eq(auditLogs.targetId, data.targetId));
		}

		if (data.dateFrom) {
			conditions.push(gte(auditLogs.createdAt, new Date(data.dateFrom)));
		}

		if (data.dateTo) {
			conditions.push(lte(auditLogs.createdAt, new Date(data.dateTo)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Get total count
		const [countResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(auditLogs)
			.where(whereClause);

		const totalCount = Number(countResult.count);

		// Create alias for target user (when targetType is 'user')
		const targetUser = alias(users, 'targetUser');

		// Get paginated results with actor and target user info
		const results = await db
			.select({
				id: auditLogs.id,
				actorId: auditLogs.actorId,
				action: auditLogs.action,
				targetType: auditLogs.targetType,
				targetId: auditLogs.targetId,
				details: auditLogs.details,
				ipAddress: auditLogs.ipAddress,
				userAgent: auditLogs.userAgent,
				createdAt: auditLogs.createdAt,
				actorName: users.name,
				actorEmail: users.email,
				actorImage: users.image,
				targetUserName: targetUser.name,
				targetUserEmail: targetUser.email,
				targetUserImage: targetUser.image,
			})
			.from(auditLogs)
			.leftJoin(users, eq(auditLogs.actorId, users.id))
			.leftJoin(
				targetUser,
				and(eq(auditLogs.targetType, 'user'), sql`${auditLogs.targetId}::uuid = ${targetUser.id}`),
			)
			.where(whereClause)
			.orderBy(desc(auditLogs.createdAt))
			.limit(limit)
			.offset(offset);

		const page = results.map((r) => ({
			id: r.id,
			actorId: r.actorId,
			action: r.action,
			targetType: r.targetType,
			targetId: r.targetId,
			details: r.details ? JSON.stringify(r.details) : null,
			ipAddress: r.ipAddress,
			userAgent: r.userAgent,
			createdAt: r.createdAt.getTime(),
			actorName: r.actorName,
			actorEmail: r.actorEmail,
			actorImage: r.actorImage,
			targetUserName: r.targetUserName,
			targetUserEmail: r.targetUserEmail,
			targetUserImage: r.targetUserImage,
		}));

		return {
			page,
			isDone: offset + limit >= totalCount,
			counts: {
				total: totalCount,
				filtered: totalCount,
				pages: Math.max(1, Math.ceil(totalCount / limit)),
			},
		};
	});

// Get activity stats for dashboard (admin only)
export const getActivityStats = createServerFn({ method: 'POST' }).handler(async () => {
	await requireAdmin();

	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
	const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
	const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

	// Login stats
	const [totalLogins] = await db.select({ count: sql<number>`count(*)` }).from(loginHistory);

	const [todayLogins] = await db
		.select({ count: sql<number>`count(*)` })
		.from(loginHistory)
		.where(gte(loginHistory.createdAt, today));

	const [yesterdayLogins] = await db
		.select({ count: sql<number>`count(*)` })
		.from(loginHistory)
		.where(and(gte(loginHistory.createdAt, yesterday), lte(loginHistory.createdAt, today)));

	const [last7DaysLogins] = await db
		.select({ count: sql<number>`count(*)` })
		.from(loginHistory)
		.where(gte(loginHistory.createdAt, last7Days));

	const [last30DaysLogins] = await db
		.select({ count: sql<number>`count(*)` })
		.from(loginHistory)
		.where(gte(loginHistory.createdAt, last30Days));

	// Unique active users (distinct users who logged in)
	const [uniqueActiveToday] = await db
		.select({ count: sql<number>`count(distinct ${loginHistory.userId})` })
		.from(loginHistory)
		.where(gte(loginHistory.createdAt, today));

	const [uniqueActiveYesterday] = await db
		.select({ count: sql<number>`count(distinct ${loginHistory.userId})` })
		.from(loginHistory)
		.where(and(gte(loginHistory.createdAt, yesterday), lte(loginHistory.createdAt, today)));

	const [uniqueActiveLast7Days] = await db
		.select({ count: sql<number>`count(distinct ${loginHistory.userId})` })
		.from(loginHistory)
		.where(gte(loginHistory.createdAt, last7Days));

	const last14Days = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
	const [uniqueActivePrevious7Days] = await db
		.select({ count: sql<number>`count(distinct ${loginHistory.userId})` })
		.from(loginHistory)
		.where(and(gte(loginHistory.createdAt, last14Days), lte(loginHistory.createdAt, last7Days)));

	const [uniqueActiveLast30Days] = await db
		.select({ count: sql<number>`count(distinct ${loginHistory.userId})` })
		.from(loginHistory)
		.where(gte(loginHistory.createdAt, last30Days));

	const last60Days = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
	const [uniqueActivePrevious30Days] = await db
		.select({ count: sql<number>`count(distinct ${loginHistory.userId})` })
		.from(loginHistory)
		.where(and(gte(loginHistory.createdAt, last60Days), lte(loginHistory.createdAt, last30Days)));

	// Provider breakdown
	const providerStats = await db
		.select({
			provider: loginHistory.provider,
			count: sql<number>`count(*)`,
		})
		.from(loginHistory)
		.groupBy(loginHistory.provider);

	// Audit log stats
	const [totalAuditLogs] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs);

	const [last7DaysAuditLogs] = await db
		.select({ count: sql<number>`count(*)` })
		.from(auditLogs)
		.where(gte(auditLogs.createdAt, last7Days));

	// Action breakdown (last 30 days)
	const actionStats = await db
		.select({
			action: auditLogs.action,
			count: sql<number>`count(*)`,
		})
		.from(auditLogs)
		.where(gte(auditLogs.createdAt, last30Days))
		.groupBy(auditLogs.action);

	// Daily logins for chart (last 30 days)
	const dailyLogins = await db
		.select({
			date: sql<string>`date(${loginHistory.createdAt})`,
			count: sql<number>`count(*)`,
		})
		.from(loginHistory)
		.where(gte(loginHistory.createdAt, last30Days))
		.groupBy(sql`date(${loginHistory.createdAt})`)
		.orderBy(sql`date(${loginHistory.createdAt})`);

	// Top users by login count (last 30 days)
	const topUsersByLogins = await db
		.select({
			userId: loginHistory.userId,
			count: sql<number>`count(*)`,
			userName: users.name,
			userEmail: users.email,
			userImage: users.image,
		})
		.from(loginHistory)
		.leftJoin(users, eq(loginHistory.userId, users.id))
		.where(gte(loginHistory.createdAt, last30Days))
		.groupBy(loginHistory.userId, users.name, users.email, users.image)
		.orderBy(desc(sql`count(*)`))
		.limit(10);

	return {
		logins: {
			total: Number(totalLogins.count),
			today: Number(todayLogins.count),
			yesterday: Number(yesterdayLogins.count),
			last7Days: Number(last7DaysLogins.count),
			last30Days: Number(last30DaysLogins.count),
			avgPerDay: Math.round(Number(last30DaysLogins.count) / 30),
		},
		activeUsers: {
			today: Number(uniqueActiveToday.count),
			yesterday: Number(uniqueActiveYesterday.count),
			last7Days: Number(uniqueActiveLast7Days.count),
			previous7Days: Number(uniqueActivePrevious7Days.count),
			last30Days: Number(uniqueActiveLast30Days.count),
			previous30Days: Number(uniqueActivePrevious30Days.count),
		},
		providerBreakdown: providerStats.reduce(
			(acc, { provider, count }) => {
				acc[provider] = Number(count);
				return acc;
			},
			{} as Record<string, number>,
		),
		auditLogs: {
			total: Number(totalAuditLogs.count),
			last7Days: Number(last7DaysAuditLogs.count),
		},
		actionBreakdown: actionStats.reduce(
			(acc, { action, count }) => {
				acc[action] = Number(count);
				return acc;
			},
			{} as Record<string, number>,
		),
		dailyLogins: dailyLogins.map((d) => ({
			date: d.date,
			count: Number(d.count),
		})),
		topUsersByLogins: topUsersByLogins.map((u) => ({
			userId: u.userId,
			count: Number(u.count),
			userName: u.userName,
			userEmail: u.userEmail,
			userImage: u.userImage,
		})),
	};
});

/**
 * Get daily login data for charts with configurable time range
 */
export const getLoginsChartData = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			days: v.optional(
				v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3650))),
			), // null = all time
		}),
	)
	.handler(async ({ data: { days } }) => {
		await requireAdmin();

		// Calculate start date based on days parameter
		const startDate =
			days === null || days === undefined
				? ALL_TIME_FLOOR_DATE
				: new Date(Date.now() - days * 24 * 60 * 60 * 1000);

		// Get daily login counts from start date
		const dailyLogins = await db
			.select({
				date: sql<string>`date(${loginHistory.createdAt})`,
				count: sql<number>`count(*)`,
			})
			.from(loginHistory)
			.where(gte(loginHistory.createdAt, startDate))
			.groupBy(sql`date(${loginHistory.createdAt})`)
			.orderBy(sql`date(${loginHistory.createdAt})`);

		return dailyLogins.map((d) => ({
			date: d.date,
			count: Number(d.count),
		}));
	});
