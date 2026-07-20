import { z } from 'zod';
import { libraries } from '~/libraries';
import { getPopularComparisons } from '~/routes/stats/npm/-comparisons';
import { fetchNpmDownloadsBulk } from '~/utils/stats.server';

const rangeOptions = ['30d', '90d', '180d', '1y', '2y', 'all'] as const;
const binOptions = ['monthly', 'weekly', 'daily'] as const;

type Range = (typeof rangeOptions)[number];
type Bin = (typeof binOptions)[number];

const RANGE_DAYS: Record<string, number> = {
	'30d': 30,
	'90d': 90,
	'180d': 180,
	'1y': 365,
	'2y': 730,
};

export const npmStatsSchema = z.object({
	library: z.string().optional().describe('TanStack library ID (e.g., query, router, table)'),
	packages: z
		.array(z.string())
		.min(1)
		.max(10)
		.optional()
		.describe('NPM packages to compare (max 10)'),
	preset: z.string().optional().describe('Preset comparison ID (e.g., data-fetching, routing)'),
	listPresets: z.boolean().optional().describe('List available preset comparisons'),
	range: z.enum(rangeOptions).optional().describe('Time range (default: 90d)'),
	bin: z.enum(binOptions).optional().describe('Aggregation level (default: monthly)'),
});

export type NpmStatsInput = z.infer<typeof npmStatsSchema>;

function toPresetId(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function getDateRange(range: Range) {
	const today = new Date();
	const endDate = today.toISOString().substring(0, 10);
	const startDate =
		range === 'all'
			? '2015-01-10'
			: new Date(today.getTime() - RANGE_DAYS[range] * 86400000).toISOString().substring(0, 10);
	return { startDate, endDate };
}

function aggregateByBin(data: Array<{ day: string; downloads: number }>, bin: Bin) {
	if (bin === 'daily') {
		return data.map((d) => ({ date: d.day, downloads: d.downloads }));
	}

	const binned = new Map<string, number>();
	for (const { day, downloads } of data) {
		const date = new Date(day);
		const binKey =
			bin === 'weekly'
				? new Date(date.setDate(date.getDate() - date.getDay())).toISOString().substring(0, 10)
				: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
		binned.set(binKey, (binned.get(binKey) ?? 0) + downloads);
	}

	return Array.from(binned, ([date, downloads]) => ({ date, downloads })).sort((a, b) =>
		a.date.localeCompare(b.date),
	);
}

function extractPackageNames(comparison: ReturnType<typeof getPopularComparisons>[number]) {
	return comparison.packageGroups.flatMap((g) =>
		g.packages.filter((p) => !p.hidden).map((p) => p.name),
	);
}

async function getOrgStats() {
	const { getHomepageNpmStatsSummary } = await import('~/utils/homepage-npm-stats.server');
	const summary = await getHomepageNpmStatsSummary();

	if (!summary) {
		throw new Error('NPM stats not available. Stats are refreshed every 6 hours.');
	}

	return {
		org: 'tanstack',
		totalDownloads: summary.totalDownloads,
		ratePerDay: summary.weeklyRatePerDay,
		libraries: summary.librarySummaries
			.map((lib) => ({
				id: lib.libraryId,
				downloads: lib.totalDownloads,
				packages: lib.packageCount,
			}))
			.sort((a, b) => b.downloads - a.downloads),
	};
}

async function getLibraryStats(libraryId: string) {
	const library = libraries.find((item) => item.id === libraryId);
	if (!library) {
		throw new Error(
			`Library "${libraryId}" not found. Use list_libraries to see available libraries.`,
		);
	}

	const packageNames =
		library.npmPackageNames ?? (library.corePackageName ? [library.corePackageName] : []);

	if (packageNames.length === 0) {
		throw new Error(`Library "${libraryId}" does not declare NPM packages.`);
	}

	const comparison = await comparePackages(packageNames, 'all', 'monthly');
	const packages = comparison.packages.map((pkg) => ({
		name: pkg.name,
		downloads: pkg.total,
		ratePerDay: pkg.avgPerDay,
	}));

	return {
		library: libraryId,
		totalDownloads: packages.reduce((sum, p) => sum + p.downloads, 0),
		ratePerDay: packages.reduce((sum, p) => sum + p.ratePerDay, 0),
		packages,
	};
}

async function comparePackages(packageNames: Array<string>, range: Range, bin: Bin) {
	const { startDate, endDate } = getDateRange(range);

	const results = await fetchNpmDownloadsBulk({
		data: {
			packageGroups: packageNames.map((name) => ({ packages: [{ name }] })),
			startDate,
			endDate,
		},
	});

	const packages = results
		.map((group: any, i: number) => {
			const downloads = group.packages[0].downloads as Array<{
				day: string;
				downloads: number;
			}>;
			const total = downloads.reduce((sum, d) => sum + d.downloads, 0);
			return {
				name: packageNames[i],
				total,
				avgPerDay: Math.round(total / Math.max(1, downloads.length)),
				data: aggregateByBin(downloads, bin),
			};
		})
		.sort((a: { total: number }, b: { total: number }) => b.total - a.total);

	return { range: { start: startDate, end: endDate }, bin, packages };
}

export async function npmStats(input: NpmStatsInput) {
	const range = input.range ?? '90d';
	const bin = input.bin ?? 'monthly';

	if (input.listPresets) {
		return {
			presets: getPopularComparisons().map((c) => ({
				id: toPresetId(c.title),
				name: c.title,
				packages: extractPackageNames(c),
			})),
		};
	}

	if (input.preset) {
		const preset = getPopularComparisons().find((c) => toPresetId(c.title) === input.preset);
		if (!preset) {
			throw new Error(
				`Preset "${input.preset}" not found. Use listPresets: true to see available presets.`,
			);
		}
		return comparePackages(extractPackageNames(preset), range, bin);
	}

	if (input.packages) {
		return comparePackages(input.packages, range, bin);
	}

	if (input.library) {
		return getLibraryStats(input.library);
	}

	return getOrgStats();
}
