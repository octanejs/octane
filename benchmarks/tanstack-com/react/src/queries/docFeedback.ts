import { queryOptions } from '@tanstack/react-query';
import {
	getUserDocFeedback,
	listDocFeedbackForModeration,
	getDocFeedbackLeaderboard,
	getDocFeedbackForPage,
} from '~/utils/docFeedback.functions';
import type { DocFeedbackStatus, DocFeedbackType } from '~/db/types';

export interface DocFeedbackFilters {
	status?: DocFeedbackStatus[];
	type?: DocFeedbackType[];
	libraryId?: string;
	isDetached?: boolean;
	userId?: string;
	dateFrom?: string;
	dateTo?: string;
}

export interface DocFeedbackPagination {
	page: number;
	pageSize: number;
}

export const getUserDocFeedbackQueryOptions = (params: {
	pagination: DocFeedbackPagination;
	filters?: {
		status?: DocFeedbackStatus[];
		libraryId?: string;
		type?: DocFeedbackType[];
	};
}) =>
	queryOptions({
		queryKey: ['docFeedback', 'user', params],
		queryFn: () => getUserDocFeedback({ data: params }),
	});

export const listDocFeedbackForModerationQueryOptions = (params: {
	pagination: DocFeedbackPagination;
	filters?: DocFeedbackFilters;
}) =>
	queryOptions({
		queryKey: ['docFeedback', 'moderation', params],
		queryFn: () => listDocFeedbackForModeration({ data: params }),
		staleTime: 0,
	});

export const getDocFeedbackLeaderboardQueryOptions = (params: {
	pagination: DocFeedbackPagination;
}) =>
	queryOptions({
		queryKey: ['docFeedback', 'leaderboard', params],
		queryFn: () => getDocFeedbackLeaderboard({ data: params }),
	});

export const getDocFeedbackForPageQueryOptions = (params: {
	pagePath: string;
	libraryVersion: string;
}) =>
	queryOptions({
		queryKey: ['docFeedback', 'page', params],
		queryFn: () => getDocFeedbackForPage({ data: params }),
	});
