import { createServerFn } from '@tanstack/react-start';
import * as v from 'valibot';
import {
	recordDailyActivity,
	getUserStreak,
	getActiveUserStats,
	getStreakLeaderboard,
	getDailyActiveUserCounts,
} from './activity.server';
import { getAuthenticatedUser } from './auth.server-helpers';
import { requireAdmin } from './roles.server';

// Record activity for the current user (called on authenticated requests)
export const recordActivity = createServerFn({ method: 'POST' }).handler(async () => {
	const user = await getAuthenticatedUser();
	await recordDailyActivity(user.userId);
	return { success: true };
});

// Get current user's streak info
export const getMyStreak = createServerFn({ method: 'POST' }).handler(async () => {
	const user = await getAuthenticatedUser();
	const streak = await getUserStreak(user.userId);
	return streak;
});

// Get activity stats for admin dashboard
export const getActivityStatsAdmin = createServerFn({ method: 'POST' }).handler(async () => {
	await requireAdmin();

	const [activeUserStats, streakLeaderboard, dailyActiveUsers] = await Promise.all([
		getActiveUserStats(),
		getStreakLeaderboard(10),
		getDailyActiveUserCounts(),
	]);

	return {
		...activeUserStats,
		streakLeaderboard,
		dailyActiveUsers,
	};
});

/**
 * Get daily active user data for charts with configurable time range
 */
export const getDauChartData = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			days: v.optional(v.nullable(v.number())), // null = all time
		}),
	)
	.handler(async ({ data: { days } }) => {
		await requireAdmin();
		return getDailyActiveUserCounts(days ?? null);
	});
