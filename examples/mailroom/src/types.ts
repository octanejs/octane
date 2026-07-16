export type FolderId = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'outbox';

export type MailMessage = {
	id: string;
	from: string;
	to: string[];
	subject: string;
	preview: string;
	body: string[];
	receivedAt: string;
	folder: 'inbox' | 'sent' | 'archive';
	read: boolean;
	starred: boolean;
};

export type MailDraft = {
	id: string;
	to: string;
	subject: string;
	body: string;
	updatedAt: string;
};

export type OutboxItem = MailDraft & {
	queuedAt: string;
};

export type MailroomState = {
	messages: MailMessage[];
	drafts: MailDraft[];
	outbox: OutboxItem[];
	nextDraft: number;
	nextOutbox: number;
	nextSent: number;
	mutationVersions: Record<string, number>;
	consumedFaults: string[];
};

export type WorkspaceSnapshot = {
	messages: MailMessage[];
	drafts: MailDraft[];
	outbox: OutboxItem[];
	counts: Record<FolderId, number>;
};

export type MailboxSnapshot = WorkspaceSnapshot & {
	folder: FolderId;
	selectedMessage: MailMessage | null;
};

export type ComposeSnapshot = {
	draft: MailDraft;
	isNew: boolean;
};

export type MailActionResult = {
	ok: boolean;
	kind: 'star' | 'draft' | 'send' | 'queue' | 'flush';
	message?: string;
	messageId?: string;
	draftId?: string;
	starred?: boolean;
	applied?: boolean;
};
