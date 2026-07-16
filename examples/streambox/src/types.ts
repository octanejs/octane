export type WatchPanel = 'overview' | 'comments' | 'transcript';

export interface WatchRoute {
	videoId: string;
	panel: WatchPanel;
}

export interface Chapter {
	title: string;
	start: number;
}

export interface TranscriptCue {
	start: number;
	text: string;
}

export interface VideoRecord {
	id: string;
	title: string;
	creator: string;
	creatorInitials: string;
	category: string;
	description: string;
	views: string;
	published: string;
	durationLabel: string;
	accent: string;
	poster: string;
	chapters: readonly Chapter[];
	transcript: readonly TranscriptCue[];
}

export interface CommentRecord {
	id: string;
	index: number;
	author: string;
	initials: string;
	when: string;
	body: string;
	likes: number;
	timecode: number;
	creatorLiked: boolean;
}
