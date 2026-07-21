import * as v from 'valibot';
import type { LibrarySlim, Framework } from '~/libraries/types';
import { packageGroupSchema } from '~/routes/stats/npm/-comparisons';

export type PackageGroup = v.InferOutput<typeof packageGroupSchema>;

// Default colors for charts
export const defaultColors = [
	'#1f77b4', // blue
	'#ff7f0e', // orange
	'#2ca02c', // green
	'#d62728', // red
	'#9467bd', // purple
	'#8c564b', // brown
	'#e377c2', // pink
	'#7f7f7f', // gray
	'#bcbd22', // yellow-green
	'#17becf', // cyan
] as const;

// Framework display names and colors
export const frameworkMeta: Record<Framework, { name: string; color: string }> = {
	react: { name: 'React', color: '#61DAFB' },
	preact: { name: 'Preact', color: '#673AB8' },
	solid: { name: 'Solid', color: '#2C4F7C' },
	vue: { name: 'Vue', color: '#42B883' },
	svelte: { name: 'Svelte', color: '#FF3E00' },
	angular: { name: 'Angular', color: '#DD0031' },
	lit: { name: 'Lit', color: '#325CFF' },
	alpine: { name: 'Alpine', color: '#77C1D2' },
	marko: { name: 'Marko', color: '#44bfef' },
	ember: { name: 'Ember', color: '#E04E39' },
	qwik: { name: 'Qwik', color: '#18B6F6' },
	vanilla: { name: 'Vanilla', color: '#F7DF1E' },
};

// Competitor packages for each library (keyed by library id)
// These are the only packages that need manual maintenance
const libraryCompetitors: Partial<Record<string, PackageGroup[]>> = {
	query: [
		{ packages: [{ name: 'swr' }], color: '#ec4899' },
		{ packages: [{ name: '@apollo/client' }], color: '#6B46C1' },
		{ packages: [{ name: '@trpc/client' }], color: '#2596BE' },
	],
	router: [
		{ packages: [{ name: 'react-router' }], color: '#FF0000' },
		{ packages: [{ name: 'wouter' }], color: '#8b5cf6' },
	],
	table: [
		{
			packages: [{ name: 'ag-grid-community' }, { name: 'ag-grid-enterprise' }],
			color: '#29B6F6',
		},
		{ packages: [{ name: 'handsontable' }], color: '#FFCA28' },
		{ packages: [{ name: '@mui/x-data-grid' }], color: '#1976D2' },
	],
	form: [
		{ packages: [{ name: 'react-hook-form' }], color: '#EC5990' },
		{ packages: [{ name: '@conform-to/dom' }], color: '#FF5733' },
	],
	virtual: [
		{ packages: [{ name: 'react-virtualized' }], color: '#FF6B6B' },
		{ packages: [{ name: 'react-window' }], color: '#4ECDC4' },
		{ packages: [{ name: 'virtua' }], color: '#6C5CE7' },
	],
	store: [
		{ packages: [{ name: 'zustand' }], color: '#764ABC' },
		{ packages: [{ name: 'jotai' }], color: '#6366f1' },
		{ packages: [{ name: 'valtio' }], color: '#FF6B6B' },
	],
	pacer: [
		{ packages: [{ name: 'lodash.debounce' }], color: '#3498db' },
		{ packages: [{ name: 'lodash.throttle' }], color: '#2ecc71' },
	],
};

/**
 * Get the NPM package name for a library + framework combination.
 * Handles special cases like angular-query-experimental.
 */
export function getFrameworkPackageName(library: LibrarySlim, framework: Framework): string | null {
	// Vanilla doesn't have a framework adapter (uses core package)
	if (framework === 'vanilla') {
		return null;
	}

	// Special cases for package naming
	if (library.id === 'query' && framework === 'angular') {
		return '@tanstack/angular-query-experimental';
	}

	// Standard pattern: @tanstack/{framework}-{libraryId}
	return `@tanstack/${framework}-${library.id}`;
}

/**
 * Get the core/main package name for a library.
 * This is the primary package shown in npm stats.
 */
export function getLibraryMainPackage(library: LibrarySlim): string {
	// Special cases
	if (library.id === 'start') {
		return '@tanstack/start-client-core';
	}
	if (library.id === 'config') {
		return '@tanstack/vite-config';
	}
	if (library.id === 'create-tsrouter-app') {
		return 'create-tsrouter-app';
	}

	// Use corePackageName if specified (e.g., table-core)
	if (library.corePackageName) {
		return library.corePackageName;
	}

	return `@tanstack/${library.id}`;
}

/**
 * Get the library's brand color from its styling.
 * Extracts color from colorFrom (e.g., "from-red-500" -> "#EF4444")
 */
export function getLibraryColor(library: LibrarySlim): string {
	// Map Tailwind color classes to hex values
	const colorMap: Record<string, string> = {
		'from-red-500': '#EF4444',
		'from-amber-500': '#F59E0B',
		'from-emerald-500': '#10B981',
		'from-teal-500': '#14B8A6',
		'from-cyan-500': '#06B6D4',
		'from-blue-500': '#3B82F6',
		'from-yellow-500': '#EAB308',
		'from-purple-500': '#A855F7',
		'from-pink-500': '#EC4899',
		'from-orange-500': '#F97316',
		'from-lime-500': '#84CC16',
		'from-twine-500': '#B89A56',
		'from-black': '#1F2937',
	};

	// Try to extract color from colorFrom
	const colorClass = library.colorFrom.split(' ')[0];
	return colorMap[colorClass] ?? defaultColors[0];
}

/**
 * Get the primary package group for a library (main package + legacy packages).
 */
export function getLibraryPackageGroup(library: LibrarySlim): PackageGroup {
	const mainPackage = getLibraryMainPackage(library);
	const packages = [{ name: mainPackage }];

	// Add legacy packages if any
	if (library.legacyPackages) {
		for (const legacy of library.legacyPackages) {
			packages.push({ name: legacy });
		}
	}

	return {
		packages,
		color: getLibraryColor(library),
	};
}

/**
 * Get available framework adapters for a library that aren't already in the current packages.
 */
export function getAvailableFrameworkAdapters(
	library: LibrarySlim,
	currentPackages: PackageGroup[],
): Array<{ framework: Framework; packageName: string; color: string }> {
	// Get all package names currently in the chart
	const currentPackageNames = new Set(
		currentPackages.flatMap((pg) => pg.packages.map((p) => p.name)),
	);

	return library.frameworks
		.map((framework) => {
			const packageName = getFrameworkPackageName(library, framework);
			if (!packageName) return null;
			// Skip if already added
			if (currentPackageNames.has(packageName)) return null;

			return {
				framework,
				packageName,
				color: frameworkMeta[framework]?.color ?? defaultColors[0],
			};
		})
		.filter(
			(item): item is { framework: Framework; packageName: string; color: string } => item !== null,
		);
}

/**
 * Get the NPM packages for a specific library (main package + legacy).
 */
export function getLibraryNpmPackages(library: LibrarySlim): PackageGroup[] {
	return [getLibraryPackageGroup(library)];
}

/**
 * Get available competitor packages for a library that aren't already in the current packages.
 */
export function getAvailableCompetitors(
	library: LibrarySlim,
	currentPackages: PackageGroup[],
): PackageGroup[] {
	const competitors = libraryCompetitors[library.id] ?? [];
	if (competitors.length === 0) return [];

	// Get all package names currently in the chart
	const currentPackageNames = new Set(
		currentPackages.flatMap((pg) => pg.packages.map((p) => p.name)),
	);

	// Filter out competitors that are already added
	return competitors.filter((competitor) => {
		const mainPackageName = competitor.packages[0]?.name;
		return mainPackageName && !currentPackageNames.has(mainPackageName);
	});
}

/**
 * Get comparison packages for a library (library + competitors).
 * @deprecated Use getLibraryNpmPackages for default packages and getAvailableCompetitors for suggestions
 */
export function getLibraryComparisonPackages(library: LibrarySlim): PackageGroup[] {
	const libraryPackages = getLibraryNpmPackages(library);
	const competitors = libraryCompetitors[library.id] ?? [];

	return [...libraryPackages, ...competitors];
}
