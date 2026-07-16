export type ChannelId = 'general' | 'design' | 'random';

export interface Author {
	name: string;
	initials: string;
	tone: string;
}

export interface Message {
	id: string;
	channel: ChannelId;
	author: Author;
	body: string;
	sentAt: string;
	order: number;
	reactions: number;
	threadCount: number;
	clientRequestId?: string;
	delivery?: 'pending' | 'failed';
}

export interface HistoryPage {
	messages: Message[];
	hasMore: boolean;
}

export interface ThreadReply {
	id: string;
	author: Author;
	body: string;
	sentAt: string;
}

export interface ThreadData {
	parentId: string;
	replies: ThreadReply[];
}

export interface Route {
	channel: ChannelId;
	threadId: string | null;
}

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'paused';
export type LoadState = 'loading' | 'ready' | 'error';
