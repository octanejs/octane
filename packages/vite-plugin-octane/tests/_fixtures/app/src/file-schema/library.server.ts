export function readLibraryTitle(id: string): string {
	return id === 'draft' ? 'Unpublished draft title' : 'Untitled';
}
