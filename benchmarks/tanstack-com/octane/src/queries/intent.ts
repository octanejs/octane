import { queryOptions } from '@octanejs/tanstack-query';
import {
	getIntentStats,
	getIntentDirectory,
	getIntentPackageDetail,
	getIntentVersionSkills,
	diffIntentVersions,
	searchIntentSkills,
	getIntentSkillHistory,
	getIntentPackageChangelog,
	getIntentSingleSkillHistory,
	getIntentSkillContentDiff,
} from '~/utils/intent.functions';

export const intentStatsQueryOptions = () =>
	queryOptions({
		queryKey: ['intent', 'stats'],
		queryFn: () => getIntentStats(),
		staleTime: 5 * 60 * 1000,
	});

export const intentDirectoryQueryOptions = (params: {
	search?: string;
	framework?: string;
	sort?: 'downloads' | 'name' | 'skills' | 'newest';
	page?: number;
	pageSize?: number;
}) =>
	queryOptions({
		queryKey: ['intent', 'directory', params],
		queryFn: () => getIntentDirectory({ data: params }),
		staleTime: 5 * 60 * 1000,
	});

export const intentPackageDetailQueryOptions = (name: string) =>
	queryOptions({
		queryKey: ['intent', 'package', name],
		queryFn: () => getIntentPackageDetail({ data: { name } }),
		staleTime: 10 * 60 * 1000,
	});

export const intentVersionSkillsQueryOptions = (params: { packageName: string; version: string }) =>
	queryOptions({
		queryKey: ['intent', 'skills', params.packageName, params.version],
		queryFn: () => getIntentVersionSkills({ data: params }),
		staleTime: 30 * 60 * 1000,
	});

export const intentSkillSearchQueryOptions = (query: string) =>
	queryOptions({
		queryKey: ['intent', 'skill-search', query],
		queryFn: () => searchIntentSkills({ data: { query } }),
		staleTime: 2 * 60 * 1000,
		enabled: query.trim().length > 0,
	});

export const intentVersionDiffQueryOptions = (params: {
	packageName: string;
	fromVersion: string;
	toVersion: string;
}) =>
	queryOptions({
		queryKey: ['intent', 'diff', params],
		queryFn: () => diffIntentVersions({ data: params }),
		staleTime: 30 * 60 * 1000,
	});

export const intentSkillHistoryQueryOptions = (packageNames: Array<string>) =>
	queryOptions({
		queryKey: ['intent', 'skill-history', packageNames],
		queryFn: () => getIntentSkillHistory({ data: { packageNames } }),
		staleTime: 10 * 60 * 1000,
		enabled: packageNames.length > 0,
	});

export const intentPackageChangelogQueryOptions = (packageName: string) =>
	queryOptions({
		queryKey: ['intent', 'changelog', packageName],
		queryFn: () => getIntentPackageChangelog({ data: { packageName } }),
		staleTime: 10 * 60 * 1000,
	});

export const intentSingleSkillHistoryQueryOptions = (params: {
	packageName: string;
	skillName: string;
}) =>
	queryOptions({
		queryKey: ['intent', 'single-skill-history', params],
		queryFn: () => getIntentSingleSkillHistory({ data: params }),
		staleTime: 10 * 60 * 1000,
	});

export const intentSkillContentDiffQueryOptions = (params: {
	packageName: string;
	skillName: string;
	fromVersion: string;
	toVersion: string;
}) =>
	queryOptions({
		queryKey: ['intent', 'skill-content-diff', params],
		queryFn: () => getIntentSkillContentDiff({ data: params }),
		staleTime: 30 * 60 * 1000,
	});
