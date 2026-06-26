// Hacker News Firebase API shapes. Framework-agnostic — shared verbatim by the
// React (.tsx) and TSRX apps.

export type ItemType = 'story' | 'comment' | 'job' | 'poll' | 'pollopt';

export interface Story {
	id: number;
	type: ItemType;
	by?: string;
	time: number;
	title?: string;
	url?: string;
	score?: number;
	descendants?: number;
	kids?: number[];
	text?: string;
}

export interface Comment {
	id: number;
	type: ItemType;
	by?: string;
	time: number;
	text?: string;
	kids?: number[];
	parent?: number;
	deleted?: boolean;
	dead?: boolean;
}

export interface User {
	id: string;
	created: number;
	karma: number;
	about?: string;
	submitted?: number[];
}
