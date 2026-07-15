import type { BoardRoute } from './types.ts';

export function readBoardRoute(location: Pick<Location, 'pathname'> = window.location): BoardRoute {
	const match = /^\/issues\/([^/]+)\/?$/.exec(location.pathname);
	return { issueId: match ? decodeURIComponent(match[1]) : null };
}

export function boardURL(): string {
	return `/board${window.location.search}`;
}

export function issueURL(issueId: string): string {
	return `/issues/${encodeURIComponent(issueId)}${window.location.search}`;
}
