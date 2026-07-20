/**
 * Server functions for user statistics
 */

import { db } from '~/db/client';
import { users } from '~/db/schema';
import { hasCapability } from '~/db/types';
import { requireCapability } from './auth.server';
import { sql, gte, and, eq, lt } from 'drizzle-orm';
import { ALL_TIME_FLOOR_DATE } from './chart';

/**
 * Get comprehensive user statistics including:
 * - Total users
 * - Users per day (last 7 days)
 * - Users per week (last 4 weeks)
 * - Users per month (last 12 months)
 * - Daily signup data for charting
 * - Ads waitlist statistics
 * - Ads disabled statistics
 */
export async function getUserStats() {
	await requireCapability({ data: { capability: 'admin' } });

	// Get total user count
	const totalUsersResult = await db.select({ count: sql<number>`count(*)::int` }).from(users);

	const totalUsers = totalUsersResult[0]?.count ?? 0;

	// Get users created in last 7 days (for daily breakdown) - using UTC
	const nowForSevenDays = new Date();
	const sevenDaysAgo = new Date(
		Date.UTC(
			nowForSevenDays.getUTCFullYear(),
			nowForSevenDays.getUTCMonth(),
			nowForSevenDays.getUTCDate() - 7,
		),
	);

	const recentUsers = await db.query.users.findMany({
		where: gte(users.createdAt, sevenDaysAgo),
		columns: {
			createdAt: true,
		},
	});

	// Calculate daily signups for last 7 days
	const dailySignups: Record<string, number> = {};
	for (let i = 6; i >= 0; i--) {
		const date = new Date();
		date.setDate(date.getDate() - i);
		const dateKey = date.toISOString().split('T')[0];
		dailySignups[dateKey] = 0;
	}

	recentUsers.forEach((user) => {
		const dateKey = user.createdAt.toISOString().split('T')[0];
		if (dateKey in dailySignups) {
			dailySignups[dateKey]++;
		}
	});

	// Get daily signup counts (aggregated by day) - using UTC for consistency
	// This gives us efficient per-day data that can be used for both daily and cumulative charts
	const dailySignupsData = await db
		.select({
			date: sql<string>`DATE(${users.createdAt} AT TIME ZONE 'UTC')`.as('date'),
			count: sql<number>`COUNT(*)::int`.as('count'),
		})
		.from(users)
		.groupBy(sql`DATE(${users.createdAt} AT TIME ZONE 'UTC')`)
		.orderBy(sql`DATE(${users.createdAt} AT TIME ZONE 'UTC')`);

	// Convert to array of objects with proper date strings
	const signupsPerDay = dailySignupsData.map((row) => ({
		date: row.date,
		count: row.count,
	}));

	// Get ads waitlist statistics
	const adsWaitlistResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(eq(users.interestedInHidingAds, true));

	const adsWaitlistCount = adsWaitlistResult[0]?.count ?? 0;

	// Get ads disabled statistics
	const adsDisabledResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(eq(users.adsDisabled, true));

	const adsDisabledCount = adsDisabledResult[0]?.count ?? 0;

	// Get users with disableAds capability
	const userCapabilities = await db.query.users.findMany({
		columns: {
			capabilities: true,
		},
	});

	const adsCapabilityCount = userCapabilities.reduce(
		(count, user) => (hasCapability(user.capabilities, 'disableAds') ? count + 1 : count),
		0,
	);

	// Get users on waitlist who now have ads disabled
	const waitlistWithAdsDisabledResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(and(eq(users.interestedInHidingAds, true), eq(users.adsDisabled, true)));

	const waitlistWithAdsDisabledCount = waitlistWithAdsDisabledResult[0]?.count ?? 0;

	// Calculate average signups per day (last 30 days) - using UTC
	const nowForThirtyDays = new Date();
	const thirtyDaysAgo = new Date(
		Date.UTC(
			nowForThirtyDays.getUTCFullYear(),
			nowForThirtyDays.getUTCMonth(),
			nowForThirtyDays.getUTCDate() - 30,
		),
	);

	const last30DaysResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(gte(users.createdAt, thirtyDaysAgo));

	const last30DaysCount = last30DaysResult[0]?.count ?? 0;
	const avgSignupsPerDay = Math.round(last30DaysCount / 30);

	// Calculate today's signups (using UTC for consistency with charts)
	const now = new Date();
	const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

	const todayResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(gte(users.createdAt, todayStart));

	const todaySignups = todayResult[0]?.count ?? 0;

	// Calculate yesterday's signups (using UTC)
	const yesterdayStart = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
	);

	const yesterdayResult = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(users)
		.where(and(gte(users.createdAt, yesterdayStart), lt(users.createdAt, todayStart)));

	const yesterdaySignups = yesterdayResult[0]?.count ?? 0;

	return {
		totalUsers,
		todaySignups,
		yesterdaySignups,
		avgSignupsPerDay,
		dailySignups,
		signupsPerDay, // Daily signup counts for charting
		ads: {
			waitlistCount: adsWaitlistCount,
			disabledCount: adsDisabledCount,
			capabilityCount: adsCapabilityCount,
			waitlistWithAdsDisabledCount,
			waitlistConversionRate:
				adsWaitlistCount > 0
					? Math.round((waitlistWithAdsDisabledCount / adsWaitlistCount) * 100)
					: 0,
		},
	};
}

/**
 * Get daily signup data for charts with configurable time range
 */
export async function getSignupsChartData({
	data: { days },
}: {
	data: { days: number | null | undefined };
}) {
	await requireCapability({ data: { capability: 'admin' } });

	// Calculate start date based on days parameter
	const startDate =
		days === null || days === undefined
			? ALL_TIME_FLOOR_DATE
			: new Date(Date.now() - days * 24 * 60 * 60 * 1000);

	// Get daily signup counts from start date
	const dailySignupsData = await db
		.select({
			date: sql<string>`DATE(${users.createdAt} AT TIME ZONE 'UTC')`.as('date'),
			count: sql<number>`COUNT(*)::int`.as('count'),
		})
		.from(users)
		.where(gte(users.createdAt, startDate))
		.groupBy(sql`DATE(${users.createdAt} AT TIME ZONE 'UTC')`)
		.orderBy(sql`DATE(${users.createdAt} AT TIME ZONE 'UTC')`);

	return dailySignupsData.map((row) => ({
		date: row.date,
		count: row.count,
	}));
}
