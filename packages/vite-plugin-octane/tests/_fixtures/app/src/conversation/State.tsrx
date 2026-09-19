import { batchServerCalls } from 'octane';
import { action$, derived$, optimistic$, query$, signal$ } from 'octane/signals';
import { readConversation, readReceipt, startConversation, watchConversation } from './Calls.tsrx';

// Module declarations are descriptors. Mutable cells belong to the SSR request
// or browser document, never to this server module's process lifetime.
export const selectedConversation$ = signal$('A');
export const draftA$ = signal$('');
export const draftB$ = signal$('');
export const notice$ = signal$('');
export const lastOperation$ = signal$(
	null as { operationId: string; conversationId: string } | null,
);
export const conversation$ = query$(
	() => selectedConversation$.get(),
	(id, { signal }) => watchConversation(id, { signal }),
	{ kind: 'stream' },
);
export const visibleConversation$ = optimistic$(conversation$);
export const draftLength$ = derived$(() => {
	const draft =
		selectedConversation$.get() === 'A' ? draftA$.get() : draftB$.get();
	return String(draft.length);
});

// Dispatch is an explicit event, never a render, selector, or retry effect.
export const send = action$('conversation.send', async (operation, prompt: string) => {
	const conversationId = selectedConversation$.get();
	visibleConversation$.set(
		(frame) => ({
			...frame,
			turns: [...frame.turns, { id: operation.id, prompt, answer: '', status: 'running' }],
		}),
	);
	lastOperation$.set({ operationId: operation.id, conversationId });
	await startConversation({ operationId: operation.id, conversationId, prompt });
	// Reconcile by stable turn ID. The streamed source, not this POST receipt,
	// owns authoritative content and revisions. No resubmission on uncertainty.
	// This read names the accepted conversation even after navigation. Adoption
	// is selection-fenced and cannot replace a newly selected conversation.
	operation.adopt(await readConversation(conversationId));
	return operation.id;
});

export function reconcileReceipt(operationId: string, conversationId: string) {
	// These finite reads may share transport without sharing a transaction or
	// allowing a slower member to delay the faster member's promise.
	return batchServerCalls(
		{ kind: 'independent-reads', authority: 'fixture-viewer', document: 'conversation-fixture' },
		() => ({
			receipt: readReceipt(operationId),
			conversation: readConversation(conversationId),
		}),
	);
}
