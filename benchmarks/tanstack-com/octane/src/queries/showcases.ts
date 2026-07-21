import { queryOptions } from '@octanejs/tanstack-query';
import {
	getMyShowcases,
	getApprovedShowcases,
	getShowcasesByLibrary,
	getFeaturedShowcases,
	listShowcasesForModeration,
	getShowcase,
	getMyShowcaseVotes,
	getRelatedShowcases,
} from '~/utils/showcase.functions';
import type { ShowcaseStatus, ShowcaseUseCase } from '~/db/types';

export interface ShowcasePagination {
	page: number;
	pageSize: number;
}

export interface ShowcaseFilters {
	status?: ShowcaseStatus[];
	libraryId?: string[];
	useCases?: ShowcaseUseCase[];
	userId?: string;
	isFeatured?: boolean;
	featured?: boolean;
}

export const getMyShowcasesQueryOptions = (params: { pagination: ShowcasePagination }) =>
	queryOptions({
		queryKey: ['showcases', 'mine', params],
		queryFn: () => getMyShowcases({ data: params }),
	});

export const getApprovedShowcasesQueryOptions = (params: {
	pagination: ShowcasePagination;
	filters?: {
		libraryIds?: string[];
		useCases?: ShowcaseUseCase[];
		featured?: boolean;
		hasSourceCode?: boolean;
		q?: string;
	};
}) =>
	queryOptions({
		queryKey: ['showcases', 'approved', params],
		queryFn: () => getApprovedShowcases({ data: params }),
	});

export const getShowcasesByLibraryQueryOptions = (params: { libraryId: string; limit?: number }) =>
	queryOptions({
		queryKey: ['showcases', 'library', params.libraryId, params.limit],
		queryFn: () =>
			getShowcasesByLibrary({
				data: { libraryId: params.libraryId, limit: params.limit ?? 6 },
			}),
	});

export const getFeaturedShowcasesQueryOptions = (params: { limit?: number }) =>
	queryOptions({
		queryKey: ['showcases', 'featured', params.limit],
		queryFn: () => getFeaturedShowcases({ data: { limit: params.limit ?? 6 } }),
	});

export const listShowcasesForModerationQueryOptions = (params: {
	pagination: ShowcasePagination;
	filters?: ShowcaseFilters;
}) =>
	queryOptions({
		queryKey: ['showcases', 'moderation', params],
		queryFn: () => listShowcasesForModeration({ data: params }),
		staleTime: 0,
	});

export const getShowcaseQueryOptions = (showcaseId: string) =>
	queryOptions({
		queryKey: ['showcases', 'detail', showcaseId],
		queryFn: () => getShowcase({ data: { showcaseId } }),
	});

export const getMyShowcaseVotesQueryOptions = (showcaseIds: string[]) =>
	queryOptions({
		queryKey: ['showcases', 'votes', 'mine', showcaseIds],
		queryFn: () => getMyShowcaseVotes({ data: { showcaseIds } }),
		enabled: showcaseIds.length > 0,
	});

export const getRelatedShowcasesQueryOptions = (params: {
	showcaseId: string;
	libraries: string[];
	limit?: number;
}) =>
	queryOptions({
		queryKey: ['showcases', 'related', params.showcaseId],
		queryFn: () =>
			getRelatedShowcases({
				data: {
					showcaseId: params.showcaseId,
					libraries: params.libraries,
					limit: params.limit ?? 4,
				},
			}),
		enabled: params.libraries.length > 0,
	});
