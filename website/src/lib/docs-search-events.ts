export const DOCS_SEARCH_OPEN_EVENT = 'octane:open-docs-search';

export interface DocsSearchOpenDetail {
	returnFocusTo: HTMLElement | null;
}

export function openDocsSearch(event: Event): void {
	const returnFocusTo = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	document.dispatchEvent(
		new CustomEvent<DocsSearchOpenDetail>(DOCS_SEARCH_OPEN_EVENT, {
			detail: { returnFocusTo },
		}),
	);
}
