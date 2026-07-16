export interface PagecraftRoute {
	documentId: string | null;
}

export function readRoute(pathname = window.location.pathname): PagecraftRoute {
	const match = pathname.match(/^\/documents\/([^/]+)\/?$/);
	if (match === null) return { documentId: null };
	return { documentId: decodeURIComponent(match[1] ?? '') };
}

export function documentURL(documentId: string): string {
	return `/documents/${encodeURIComponent(documentId)}${window.location.search}`;
}
