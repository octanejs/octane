// Re-export everything from the base libraries file
// This is the 90% use case - lightweight data for navigation, lists, etc.
export {
	libraries,
	librariesByGroup,
	librariesGroupNamesMap,
	publicLibraries,
	libraryIds,
	SIDEBAR_LIBRARY_IDS,
	findLibrary,
	getLibrary,
	isPublicLibrary,
	// Individual library exports
	query,
	router,
	start,
	table,
	form,
	virtual,
	ranger,
	store,
	pacer,
	hotkeys,
	db,
	ai,
	intent,
	config,
	devtools,
	workflow,
	cli,
} from './libraries';

// Re-export types
export type { PublicLibrarySlim } from './libraries';
export type { Framework, Library, LibraryId, LibrarySlim } from './types';

// NOTE: Extended library projects (queryProject, routerProject, etc.) with
// testimonials, featureHighlights (containing React components) are NOT
// re-exported here to keep this import lightweight.
//
// Import them directly in routes that need the full library landing page data:
//   import { queryProject } from '~/libraries/query'
//   import { tableProject } from '~/libraries/table'
//   etc.
//
// Similarly, frameworkOptions is in './frameworks' to avoid bundling SVG imports
// in server/background functions.

import type { Library } from './types';

export function getBranch(library: Library, argVersion?: string) {
	if (!library) {
		throw new Error('Library is required');
	}

	const version = argVersion || library.latestVersion;

	const resolvedVersion = ['latest', library.latestVersion].includes(version)
		? library.latestBranch
		: version;

	if (!resolvedVersion) {
		throw new Error(`Could not resolve version for ${library.name}`);
	}

	return resolvedVersion;
}
