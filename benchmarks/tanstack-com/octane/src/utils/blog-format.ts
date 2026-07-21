import { findLibrary, type LibrarySlim } from '~/libraries';

const listJoiner = new Intl.ListFormat('en-US', {
	style: 'long',
	type: 'conjunction',
});

export function formatAuthors(authors: Array<string>) {
	if (!authors.length) {
		return 'TanStack';
	}

	return listJoiner.format(authors);
}

function getUtcDateString(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

function parsePublishedDate(published: string) {
	const [year, month, day] = published.split('-').map(Number);

	return new Date(Date.UTC(year, month - 1, day, 12));
}

export function formatPublishedDate(published: string) {
	return parsePublishedDate(published).toLocaleDateString('en-US', {
		timeZone: 'UTC',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

export function isPublishedDateReleased(published: string, now = new Date()) {
	return published <= getUtcDateString(now);
}

export function publishedDateToUTCString(published: string) {
	return parsePublishedDate(published).toUTCString();
}

function isLibrarySlim(library: LibrarySlim | undefined): library is LibrarySlim {
	return library !== undefined;
}

export function getBlogLibraries(library: string | undefined): LibrarySlim[] {
	if (!library) {
		return [];
	}

	return library
		.split(',')
		.map((libraryId) => findLibrary(libraryId.trim()))
		.filter(isLibrarySlim);
}

export function getDistinctAuthors(posts: ReadonlyArray<{ authors: string[] }>): string[] {
	const authors = new Set<string>();
	for (const post of posts) {
		for (const author of post.authors) {
			authors.add(author);
		}
	}
	return [...authors].sort((a, b) => a.localeCompare(b));
}
