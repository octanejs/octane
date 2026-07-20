import type { ShowcaseUseCase } from '~/db/types';

/**
 * Library dependencies: Start automatically includes Router
 */
export function expandLibraryDependencies(libraries: string[]): string[] {
	const expanded = new Set(libraries);

	// If 'start' is selected, automatically include 'router'
	if (expanded.has('start')) {
		expanded.add('router');
	}

	return Array.from(expanded);
}

/**
 * Get libraries that are auto-included (for UI display)
 */
export function getAutoIncludedLibraries(selectedLibraries: string[]): Record<string, string> {
	const autoIncluded: Record<string, string> = {};

	if (selectedLibraries.includes('start')) {
		autoIncluded['router'] = 'Included via Start';
	}

	return autoIncluded;
}

/**
 * Valid URL check (basic format validation)
 */
export function isValidUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Use case labels for display
 */
export const USE_CASE_LABELS: Record<ShowcaseUseCase, string> = {
	blog: 'Blog',
	'e-commerce': 'E-commerce',
	saas: 'SaaS',
	dashboard: 'Dashboard',
	documentation: 'Documentation',
	portfolio: 'Portfolio',
	social: 'Social',
	'developer-tool': 'Developer Tool',
	marketing: 'Marketing',
	media: 'Media',
	'open-source': 'Open Source', // Kept for backward compatibility, not shown in UI
};
