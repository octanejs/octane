import { createServerFn } from '@octanejs/tanstack-start';
import * as v from 'valibot';
import {
	listGitHubStatsCache as listGitHubStatsCacheServer,
	refreshAllGitHubStats as refreshAllGitHubStatsServer,
	refreshAllNpmStats as refreshAllNpmStatsServer,
	refreshGitHubStats as refreshGitHubStatsServer,
} from '~/utils/stats-admin.server';

export const listGitHubStatsCache = createServerFn({ method: 'POST' }).handler(async () =>
	listGitHubStatsCacheServer(),
);

export const refreshGitHubStats = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			cacheKey: v.string(),
		}),
	)
	.handler(async ({ data }) => refreshGitHubStatsServer({ data }));

export const refreshAllGitHubStats = createServerFn({ method: 'POST' }).handler(async () =>
	refreshAllGitHubStatsServer(),
);

export const refreshAllNpmStats = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			org: v.string(),
		}),
	)
	.handler(async ({ data }) => refreshAllNpmStatsServer({ data }));
