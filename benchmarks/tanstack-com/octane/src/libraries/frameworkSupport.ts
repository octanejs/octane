import type { Framework, LibraryId, LibrarySlim } from './types';

export function getFrameworkPackageName(
	framework: Framework,
	libraryId: LibraryId,
	library: LibrarySlim,
) {
	const packageName = library.frameworkPackageNames?.[framework];

	if (packageName) {
		return packageName;
	}

	if (framework === 'vanilla') {
		return library.corePackageName ?? `@tanstack/${libraryId}`;
	}

	if (framework === 'angular' && libraryId === 'query') {
		return '@tanstack/angular-query-experimental';
	}

	return `@tanstack/${framework}-${libraryId}`;
}

export function getFrameworkDocsPath(framework: Framework, library: LibrarySlim) {
	const docsPath = library.frameworkDocs?.[framework];

	if (docsPath) {
		return docsPath;
	}

	if (library.installPath) {
		return library.installPath.replace('$framework', framework).replace('$libraryId', library.id);
	}

	return 'installation';
}

export function getFrameworkDocsHash(framework: Framework, library: LibrarySlim) {
	const hasCustomDocsPath = Boolean(library.frameworkDocs?.[framework]);

	if (hasCustomDocsPath || library.installPath) {
		return undefined;
	}

	return framework;
}
