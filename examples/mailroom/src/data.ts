import { createSeedState } from './seed';
import type {
	ComposeSnapshot,
	FolderId,
	MailActionResult,
	MailDraft,
	MailboxSnapshot,
	MailMessage,
	MailroomState,
	WorkspaceSnapshot,
} from './types';

const STORAGE_PREFIX = 'octane-mailroom-v1:';

const FOLDERS = new Set<FolderId>(['inbox', 'starred', 'sent', 'drafts', 'archive', 'outbox']);

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(resolve, milliseconds);
		if (signal === undefined) return;
		const abort = () => {
			window.clearTimeout(timer);
			reject(new DOMException('Navigation was superseded', 'AbortError'));
		};
		if (signal.aborted) abort();
		else signal.addEventListener('abort', abort, { once: true });
	});
}

function sessionFromURL(url: string): string {
	return new URL(url).searchParams.get('session') ?? 'demo';
}

function storageKey(session: string): string {
	return `${STORAGE_PREFIX}${session}`;
}

function readState(session: string): MailroomState {
	const stored = window.localStorage.getItem(storageKey(session));
	if (stored === null) {
		const seeded = createSeedState();
		writeState(session, seeded);
		return seeded;
	}
	try {
		return JSON.parse(stored) as MailroomState;
	} catch {
		const seeded = createSeedState();
		writeState(session, seeded);
		return seeded;
	}
}

function writeState(session: string, state: MailroomState): void {
	window.localStorage.setItem(storageKey(session), JSON.stringify(state));
}

function consumeFault(session: string, fault: string): boolean {
	const state = readState(session);
	if (state.consumedFaults.includes(fault)) return false;
	state.consumedFaults.push(fault);
	writeState(session, state);
	return true;
}

function countsFor(state: MailroomState): Record<FolderId, number> {
	return {
		inbox: state.messages.filter((message) => message.folder === 'inbox').length,
		starred: state.messages.filter((message) => message.starred).length,
		sent: state.messages.filter((message) => message.folder === 'sent').length,
		drafts: state.drafts.length,
		archive: state.messages.filter((message) => message.folder === 'archive').length,
		outbox: state.outbox.length,
	};
}

function workspaceFor(state: MailroomState): WorkspaceSnapshot {
	return {
		messages: state.messages,
		drafts: state.drafts,
		outbox: state.outbox,
		counts: countsFor(state),
	};
}

function messagesForFolder(state: MailroomState, folder: FolderId): MailMessage[] {
	if (folder === 'starred') return state.messages.filter((message) => message.starred);
	if (folder === 'inbox' || folder === 'sent' || folder === 'archive') {
		return state.messages.filter((message) => message.folder === folder);
	}
	return [];
}

export async function shellLoader({ request }: { request: Request }): Promise<WorkspaceSnapshot> {
	await delay(45, request.signal);
	return workspaceFor(readState(sessionFromURL(request.url)));
}

export async function mailboxLoader({
	request,
	params,
}: {
	request: Request;
	params: Record<string, string | undefined>;
}): Promise<MailboxSnapshot> {
	const url = new URL(request.url);
	const session = sessionFromURL(request.url);
	const folderCandidate = params.folder ?? 'inbox';
	if (!FOLDERS.has(folderCandidate as FolderId)) {
		throw new Response('Mailbox not found', { status: 404, statusText: 'Mailbox not found' });
	}
	const folder = folderCandidate as FolderId;
	await delay(folder === 'inbox' ? 180 : 105, request.signal);
	if (
		folder === 'inbox' &&
		url.searchParams.get('fault') === 'load' &&
		consumeFault(session, 'load:inbox')
	) {
		throw new Error('The inbox took a wrong turn before it reached your desk.');
	}
	const state = readState(session);
	const messages = messagesForFolder(state, folder);
	const selectedMessage =
		params.messageId === undefined
			? null
			: (state.messages.find(
					(message) =>
						message.id === params.messageId && (folder === 'starred' || message.folder === folder),
				) ?? null);
	return { ...workspaceFor(state), messages, folder, selectedMessage };
}

const EMPTY_DRAFT: MailDraft = {
	id: 'new',
	to: '',
	subject: '',
	body: '',
	updatedAt: 'Not saved yet',
};

export async function composeLoader({
	request,
	params,
}: {
	request: Request;
	params: Record<string, string | undefined>;
}): Promise<ComposeSnapshot> {
	await delay(90, request.signal);
	const state = readState(sessionFromURL(request.url));
	const draftId = params.draftId ?? 'new';
	if (draftId === 'new') return { draft: { ...EMPTY_DRAFT }, isNew: true };
	const draft = state.drafts.find((candidate) => candidate.id === draftId);
	if (draft === undefined) {
		throw new Response('Draft not found', { status: 404, statusText: 'Draft not found' });
	}
	return { draft, isNew: false };
}

function requiredString(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function draftFromForm(form: FormData): MailDraft {
	return {
		id: requiredString(form, 'draftId') || 'new',
		to: requiredString(form, 'to'),
		subject: requiredString(form, 'subject'),
		body: requiredString(form, 'body'),
		updatedAt: 'Saved just now',
	};
}

function upsertDraft(state: MailroomState, draft: MailDraft): MailDraft {
	const resolved = {
		...draft,
		id: draft.id === 'new' ? `draft-${state.nextDraft++}` : draft.id,
	};
	const index = state.drafts.findIndex((candidate) => candidate.id === resolved.id);
	if (index === -1) state.drafts.unshift(resolved);
	else state.drafts[index] = resolved;
	return resolved;
}

function sendDraft(state: MailroomState, draft: MailDraft): MailMessage {
	const message: MailMessage = {
		id: `sent-${state.nextSent++}`,
		from: 'You',
		to: [draft.to],
		subject: draft.subject,
		preview: draft.body,
		body: [draft.body],
		receivedAt: 'Just now',
		folder: 'sent',
		read: true,
		starred: false,
	};
	state.messages.unshift(message);
	state.drafts = state.drafts.filter((candidate) => candidate.id !== draft.id);
	return message;
}

export async function mailAction({ request }: { request: Request }): Promise<MailActionResult> {
	const url = new URL(request.url);
	const session = sessionFromURL(request.url);
	const form = await request.formData();
	const intent = requiredString(form, 'intent');

	if (intent === 'toggle-star') {
		const messageId = requiredString(form, 'messageId');
		const desired = requiredString(form, 'desired') === 'true';
		const state = readState(session);
		const version = (state.mutationVersions[messageId] ?? 0) + 1;
		state.mutationVersions[messageId] = version;
		writeState(session, state);
		await delay(url.searchParams.get('fault') === 'slow-mutation' ? 700 : 180, request.signal);
		const latest = readState(session);
		const message = latest.messages.find((candidate) => candidate.id === messageId);
		if (message === undefined) {
			return { ok: false, kind: 'star', message: 'That message no longer exists.' };
		}
		const applied = latest.mutationVersions[messageId] === version;
		if (applied) message.starred = desired;
		writeState(session, latest);
		return { ok: true, kind: 'star', messageId, starred: message.starred, applied };
	}

	if (intent === 'save-draft') {
		const draft = draftFromForm(form);
		if (draft.to === '' || draft.subject === '' || draft.body === '') {
			return {
				ok: false,
				kind: 'draft',
				message: 'Add a recipient, subject, and message before saving.',
			};
		}
		await delay(170, request.signal);
		const state = readState(session);
		const saved = upsertDraft(state, draft);
		writeState(session, state);
		return { ok: true, kind: 'draft', draftId: saved.id, message: 'Draft saved.' };
	}

	if (intent === 'send-now') {
		const draft = draftFromForm(form);
		if (draft.to === '' || draft.subject === '' || draft.body === '') {
			return { ok: false, kind: 'send', message: 'Complete every field before sending.' };
		}
		await delay(230, request.signal);
		if (url.searchParams.get('fault') === 'send' && consumeFault(session, 'send:first')) {
			return {
				ok: false,
				kind: 'send',
				message: 'The delivery service paused this message. Your draft is still here.',
			};
		}
		const state = readState(session);
		const saved = upsertDraft(state, draft);
		const sent = sendDraft(state, saved);
		writeState(session, state);
		return { ok: true, kind: 'send', messageId: sent.id, message: 'Message sent.' };
	}

	if (intent === 'queue-offline') {
		const draft = draftFromForm(form);
		if (draft.to === '' || draft.subject === '' || draft.body === '') {
			return { ok: false, kind: 'queue', message: 'Complete every field before queueing.' };
		}
		const state = readState(session);
		const id = `outbox-${state.nextOutbox++}`;
		state.outbox.push({
			...draft,
			id,
			updatedAt: 'Saved offline',
			queuedAt: 'Waiting for connection',
		});
		state.drafts = state.drafts.filter((candidate) => candidate.id !== draft.id);
		writeState(session, state);
		return { ok: true, kind: 'queue', draftId: id, message: 'Message queued offline.' };
	}

	if (intent === 'flush-outbox') {
		const outboxId = requiredString(form, 'outboxId');
		await delay(280, request.signal);
		const state = readState(session);
		const queued = state.outbox.find((candidate) => candidate.id === outboxId);
		if (queued === undefined) {
			return { ok: true, kind: 'flush', applied: false, message: 'Already delivered.' };
		}
		const sent = sendDraft(state, queued);
		state.outbox = state.outbox.filter((candidate) => candidate.id !== outboxId);
		writeState(session, state);
		return {
			ok: true,
			kind: 'flush',
			applied: true,
			messageId: sent.id,
			message: 'Queued message delivered.',
		};
	}

	return { ok: false, kind: 'draft', message: 'Unknown mail action.' };
}
