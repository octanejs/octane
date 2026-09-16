import { signal$ } from 'octane/signals';
import type { ConversationPage, ConversationTurn } from '../conversation/operations.ts';

export interface HistoryModel extends ConversationPage {
	/** Changed authoritative rows; only already-loaded IDs are merged into older pages. */
	updates: ConversationTurn[];
	source: 'cached' | 'fresh';
	receipt: | { operationId: string; conversationId: string; status: ConversationTurn['status'] }
	| null;
}

export const history$ = signal$(
	'fetched-history',
	{
		conversationId: 'A',
		revision: 0,
		turns: [],
		updates: [],
		nextCursor: null,
		source: 'fresh',
		receipt: null,
	} as HistoryModel,
);
export const selected$ = signal$('A');
export const draftA$ = signal$('');
export const draftB$ = signal$('');
export const status$ = signal$('Loading history');

export function isHistoryModel(value: unknown): value is HistoryModel {
	if (value === null || typeof value !== 'object') return false;
	const model = value as HistoryModel;
	return typeof model.conversationId === 'string' && Number.isSafeInteger(model.revision) &&
		model.revision >= 0 &&
		(model.source === 'cached' || model.source === 'fresh') &&
		(model.nextCursor === null || typeof model.nextCursor === 'string') &&
		Array.isArray(model.turns) &&
		Array.isArray(model.updates) &&
		[...model.turns, ...model.updates].every(
			(turn) =>
				turn !== null && typeof turn === 'object' && typeof turn.id === 'string' &&
					typeof turn.prompt === 'string' &&
					typeof turn.answer === 'string' &&
					['running', 'complete', 'stopped', 'timed-out', 'failed'].includes(turn.status),
		) &&
		(model.receipt === null ||
			typeof model.receipt === 'object' && typeof model.receipt.operationId === 'string' &&
				typeof model.receipt.conversationId === 'string' &&
				['running', 'complete', 'stopped', 'timed-out', 'failed'].includes(model.receipt.status));
}
