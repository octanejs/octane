import { createServerFn } from '@octanejs/tanstack-start';
import {
	getSignupsChartData as getSignupsChartDataServer,
	getUserStats as getUserStatsServer,
} from '~/utils/user-stats.server';

export const getUserStats = createServerFn({ method: 'POST' }).handler(async () =>
	getUserStatsServer(),
);

export const getSignupsChartData = createServerFn({ method: 'POST' })
	.validator((data: { days: number | null; bin?: 'day' | 'week' | 'month' }) => data)
	.handler(async ({ data }) => getSignupsChartDataServer({ data }));
