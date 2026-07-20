import { createServerFn } from '@tanstack/react-start'
import {
  fetchNpmDownloadsBulk as fetchNpmDownloadsBulkServer,
  fetchRecentDownloadStats as fetchRecentDownloadStatsServer,
  getOSSStats as getOSSStatsServer,
  type RecentDownloadStatsQueryParams,
  type StatsQueryParams,
} from './stats.server'
import { getHomepageNpmStatsSummary as getHomepageNpmStatsSummaryServer } from './homepage-npm-stats.server'

export type { StatsQueryParams } from './stats.server'

export const getOSSStats = createServerFn({ method: 'POST' })
  .validator((data: StatsQueryParams) => data)
  .handler(async ({ data }) => getOSSStatsServer({ data }))

export const getHomepageNpmStatsSummary = createServerFn({
  method: 'GET',
}).handler(async () => getHomepageNpmStatsSummaryServer())

export const fetchNpmDownloadsBulk = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      packageGroups: Array<{
        packages: Array<{
          hidden?: boolean
          name: string
        }>
      }>
      startDate: string
      endDate: string
    }) => data,
  )
  .handler(async ({ data }) => fetchNpmDownloadsBulkServer({ data }))

export const fetchRecentDownloadStats = createServerFn({ method: 'POST' })
  .validator((data: RecentDownloadStatsQueryParams) => data)
  .handler(async ({ data }) => fetchRecentDownloadStatsServer({ data }))
