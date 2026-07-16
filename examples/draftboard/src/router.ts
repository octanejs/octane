import { isBoardId, type BoardId } from './types';

export function readBoardId(location: Pick<Location, 'pathname'> = window.location): BoardId {
	const match = /^\/boards\/([^/]+)\/?$/.exec(location.pathname);
	if (match) {
		const candidate = decodeURIComponent(match[1]);
		if (isBoardId(candidate)) return candidate;
	}
	return 'launch';
}

export function boardURL(boardId: BoardId): string {
	return `/boards/${encodeURIComponent(boardId)}${window.location.search}`;
}
