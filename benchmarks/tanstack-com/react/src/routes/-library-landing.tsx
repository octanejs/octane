import { notFound } from '@tanstack/react-router';
import { findLibrary } from '~/libraries';

export type LandingLibraryId =
	| 'ai'
	| 'cli'
	| 'config'
	| 'db'
	| 'devtools'
	| 'form'
	| 'hotkeys'
	| 'intent'
	| 'pacer'
	| 'query'
	| 'ranger'
	| 'router'
	| 'start'
	| 'store'
	| 'table'
	| 'virtual'
	| 'workflow';

function getLibraryOrThrow(libraryId: string) {
	const library = findLibrary(libraryId);

	if (!library) {
		throw notFound();
	}

	return library;
}

export function validateLibraryVersion(
	libraryId: string,
	version: string | undefined,
	onInvalidVersion: () => never,
) {
	const library = getLibraryOrThrow(libraryId);

	if (!library.availableVersions.concat('latest').includes(version!)) {
		onInvalidVersion();
	}

	return library;
}
