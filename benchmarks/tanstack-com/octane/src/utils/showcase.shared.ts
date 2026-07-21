import type { ShowcaseUseCase } from '~/db/types';

export function expandLibraryDependencies(libraries: Array<string>) {
	const expanded = new Set(libraries);

	if (expanded.has('start')) {
		expanded.add('router');
	}

	return Array.from(expanded);
}

export function getAutoIncludedLibraries(selectedLibraries: Array<string>) {
	const autoIncluded: Record<string, string> = {};

	if (selectedLibraries.includes('start')) {
		autoIncluded.router = 'Included via Start';
	}

	return autoIncluded;
}

export function isValidUrl(urlString: string) {
	try {
		const url = new URL(urlString);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

export const USE_CASE_LABELS: Record<ShowcaseUseCase, string> = {
	blog: 'Blog',
	'developer-tool': 'Developer Tool',
	dashboard: 'Dashboard',
	documentation: 'Documentation',
	'e-commerce': 'E-commerce',
	marketing: 'Marketing',
	media: 'Media',
	'open-source': 'Open Source',
	portfolio: 'Portfolio',
	saas: 'SaaS',
	social: 'Social',
};
