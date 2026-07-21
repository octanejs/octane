import {
	getBlobStorage,
	getBlobStorageCache,
	type BlobStorage,
	type BlobStorageCache,
} from '~/server/runtime/blob-storage.server';
import { addUtcDays, NPM_STATS_START_DATE, toIsoDayUtc } from './npm-download-ranges';
import { fetchNpmDownloadsBulkData } from './stats.server';
import { getNpmOrgPackageNames } from './stats.functions';
import { tanStackTotalVisibleNpmPackageNames } from './tanstack-npm-stats';
import { libraries } from '~/libraries';

export type NpmStatsLibrarySummary = {
	libraryId: string;
	packageCount: number;
	totalDownloads: number;
	updatedAt: number;
};

export type HomepageNpmStatsSummary = {
	expiresAt: number;
	librarySummaries: Array<NpmStatsLibrarySummary>;
	totalDownloads: number;
	totalEndDate: string;
	totalPackageCount: number;
	totalStartDate: string;
	updatedAt: number;
	weeklyDownloads: number;
	weeklyEndDate: string;
	weeklyPackageCount: number;
	weeklyRatePerDay: number;
	weeklyStartDate: string;
};

type FetchPackageDownloadsOptions = {
	endDate: string;
	packageNames: Array<string>;
	startDate: string;
};

const HOME_NPM_STATS_STORAGE = 'npmDownloadCache';
const HOME_NPM_STATS_KEY = 'homepage-npm-stats/v1/tanstack.json';
const HOME_NPM_STATS_CONTENT_TYPE = 'application/json; charset=utf-8';
const HOME_NPM_STATS_TTL_MS = 12 * 60 * 60 * 1000;
const PACKAGE_BATCH_SIZE = 32;
const PACKAGE_BATCH_CONCURRENCY = 2;

let blobStoragePromise: Promise<BlobStorage | undefined> | undefined;
let memorySummary: HomepageNpmStatsSummary | undefined;

function getHomepageNpmStatsBlobStorage() {
	blobStoragePromise ??= getBlobStorage(HOME_NPM_STATS_STORAGE);
	return blobStoragePromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: Record<string, unknown>, key: string) {
	const rawValue = Reflect.get(value, key);
	return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : undefined;
}

function readString(value: Record<string, unknown>, key: string) {
	const rawValue = Reflect.get(value, key);
	return typeof rawValue === 'string' && rawValue.length > 0 ? rawValue : undefined;
}

function parseLibrarySummaries(value: unknown): Array<NpmStatsLibrarySummary> {
	if (!Array.isArray(value)) {
		return [];
	}

	const summaries: Array<NpmStatsLibrarySummary> = [];

	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		const libraryId = readString(item, 'libraryId');
		const packageCount = readNumber(item, 'packageCount');
		const totalDownloads = readNumber(item, 'totalDownloads');
		const updatedAt = readNumber(item, 'updatedAt');

		if (
			libraryId === undefined ||
			packageCount === undefined ||
			totalDownloads === undefined ||
			updatedAt === undefined
		) {
			continue;
		}

		summaries.push({
			libraryId,
			packageCount,
			totalDownloads,
			updatedAt,
		});
	}

	return summaries;
}

function parseHomepageNpmStatsSummary(value: unknown): HomepageNpmStatsSummary | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const expiresAt = readNumber(value, 'expiresAt');
	const totalDownloads = readNumber(value, 'totalDownloads');
	const totalEndDate = readString(value, 'totalEndDate');
	const totalPackageCount = readNumber(value, 'totalPackageCount');
	const totalStartDate = readString(value, 'totalStartDate');
	const updatedAt = readNumber(value, 'updatedAt');
	const weeklyDownloads = readNumber(value, 'weeklyDownloads');
	const weeklyEndDate = readString(value, 'weeklyEndDate');
	const weeklyPackageCount = readNumber(value, 'weeklyPackageCount');
	const weeklyRatePerDay = readNumber(value, 'weeklyRatePerDay');
	const weeklyStartDate = readString(value, 'weeklyStartDate');

	if (
		expiresAt === undefined ||
		totalDownloads === undefined ||
		totalEndDate === undefined ||
		totalPackageCount === undefined ||
		totalStartDate === undefined ||
		updatedAt === undefined ||
		weeklyDownloads === undefined ||
		weeklyEndDate === undefined ||
		weeklyPackageCount === undefined ||
		weeklyRatePerDay === undefined ||
		weeklyStartDate === undefined
	) {
		return undefined;
	}

	return {
		expiresAt,
		librarySummaries: parseLibrarySummaries(Reflect.get(value, 'librarySummaries')),
		totalDownloads,
		totalEndDate,
		totalPackageCount,
		totalStartDate,
		updatedAt,
		weeklyDownloads,
		weeklyEndDate,
		weeklyPackageCount,
		weeklyRatePerDay,
		weeklyStartDate,
	};
}

function readStoredHomepageNpmStatsSummary(text: string) {
	let parsed: unknown;

	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}

	return parseHomepageNpmStatsSummary(parsed);
}

function getSummaryMetadata(summary: HomepageNpmStatsSummary): Record<string, string> {
	return {
		expiresAt: String(summary.expiresAt),
		totalDownloads: String(summary.totalDownloads),
		totalPackageCount: String(summary.totalPackageCount),
		updatedAt: String(summary.updatedAt),
		weeklyDownloads: String(summary.weeklyDownloads),
		weeklyPackageCount: String(summary.weeklyPackageCount),
	};
}

function isFreshSummary(summary: HomepageNpmStatsSummary) {
	return summary.expiresAt > Date.now();
}

async function putCacheEntry({
	cache,
	summary,
	text,
}: {
	cache: BlobStorageCache | undefined;
	summary: HomepageNpmStatsSummary;
	text: string;
}) {
	try {
		await cache?.put(HOME_NPM_STATS_KEY, {
			metadata: getSummaryMetadata(summary),
			text,
		});
	} catch (error) {
		console.warn('[Homepage NPM Stats] Cache API write failed:', error);
	}
}

async function writeHomepageNpmStatsSummary(summary: HomepageNpmStatsSummary) {
	const text = JSON.stringify(summary);
	const cache = getBlobStorageCache(HOME_NPM_STATS_STORAGE);
	const storage = await getHomepageNpmStatsBlobStorage();

	memorySummary = summary;

	if (storage) {
		await storage.put(HOME_NPM_STATS_KEY, text, {
			contentType: HOME_NPM_STATS_CONTENT_TYPE,
			metadata: getSummaryMetadata(summary),
		});
	}

	await putCacheEntry({ cache, summary, text });
}

async function readHomepageNpmStatsSummary({ allowStale }: { allowStale: boolean }) {
	if (memorySummary && (allowStale || isFreshSummary(memorySummary))) {
		return memorySummary;
	}

	const cache = getBlobStorageCache(HOME_NPM_STATS_STORAGE);
	const cached = await cache?.get(HOME_NPM_STATS_KEY);
	if (cached) {
		const summary = readStoredHomepageNpmStatsSummary(cached.text);

		if (summary && (allowStale || isFreshSummary(summary))) {
			memorySummary = summary;
			return summary;
		}
	}

	const storage = await getHomepageNpmStatsBlobStorage();
	const object = await storage?.get(HOME_NPM_STATS_KEY);
	if (!object) {
		return undefined;
	}

	const text = await object.text();
	const summary = readStoredHomepageNpmStatsSummary(text);

	if (!summary || (!allowStale && !isFreshSummary(summary))) {
		return undefined;
	}

	memorySummary = summary;
	await putCacheEntry({ cache, summary, text });

	return summary;
}

function chunkPackageNames(packageNames: Array<string>) {
	const chunks: Array<Array<string>> = [];

	for (let index = 0; index < packageNames.length; index += PACKAGE_BATCH_SIZE) {
		chunks.push(packageNames.slice(index, index + PACKAGE_BATCH_SIZE));
	}

	return chunks;
}

async function mapWithConcurrency<T, TResult>(
	values: Array<T>,
	concurrency: number,
	fn: (value: T) => Promise<TResult>,
) {
	const results = new Array<TResult>(values.length);
	let index = 0;

	const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
		while (index < values.length) {
			const currentIndex = index;
			index += 1;
			results[currentIndex] = await fn(values[currentIndex]);
		}
	});

	await Promise.all(workers);
	return results;
}

async function fetchPackageDownloads({
	endDate,
	packageNames,
	startDate,
}: FetchPackageDownloadsOptions) {
	const uniquePackageNames = [...new Set(packageNames)].sort();

	if (uniquePackageNames.length === 0) {
		return new Map<string, number>();
	}

	const results = await mapWithConcurrency(
		chunkPackageNames(uniquePackageNames),
		PACKAGE_BATCH_CONCURRENCY,
		async (packageBatch) =>
			fetchNpmDownloadsBulkData({
				data: {
					packageGroups: [
						{
							packages: packageBatch.map((name) => ({ name })),
						},
					],
					startDate,
					endDate,
				},
			}),
	);

	const packageDownloads = new Map<string, number>();

	for (const group of results.flat()) {
		for (const pkg of group.packages) {
			const downloads = pkg.downloads.reduce(
				(downloadTotal, point) => downloadTotal + point.downloads,
				0,
			);
			packageDownloads.set(pkg.name, (packageDownloads.get(pkg.name) ?? 0) + downloads);
		}
	}

	return packageDownloads;
}

function getLibraryNpmPackageNames(library: {
	corePackageName?: string;
	npmPackageNames?: Array<string>;
}) {
	if (library.npmPackageNames?.length) {
		return library.npmPackageNames;
	}

	return library.corePackageName ? [library.corePackageName] : [];
}

function sumPackageDownloads(packageDownloads: Map<string, number>, packageNames: Array<string>) {
	return packageNames.reduce(
		(total, packageName) => total + (packageDownloads.get(packageName) ?? 0),
		0,
	);
}

function getLastCompletedNpmStatsDay() {
	const today = new Date();
	const lastCompletedDay = new Date(
		Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
	);
	lastCompletedDay.setUTCDate(lastCompletedDay.getUTCDate() - 1);
	return toIsoDayUtc(lastCompletedDay);
}

export async function refreshHomepageNpmStatsSummary({
	org = 'tanstack',
}: {
	org?: string;
} = {}) {
	const orgPackageNames = await getNpmOrgPackageNames(org);
	const libraryPackageEntries = libraries
		.map((library) => ({
			libraryId: library.id,
			packageNames: getLibraryNpmPackageNames(library),
		}))
		.filter((entry) => entry.packageNames.length > 0);
	const totalPackageNames = [
		...new Set([
			...orgPackageNames,
			...libraryPackageEntries.flatMap((entry) => entry.packageNames),
		]),
	].sort();
	const weeklyPackageNames = [...tanStackTotalVisibleNpmPackageNames].sort();
	const totalEndDate = getLastCompletedNpmStatsDay();
	const weeklyEndDate = totalEndDate;
	const weeklyStartDate = addUtcDays(weeklyEndDate, -6);
	const updatedAt = Date.now();

	const [totalPackageDownloads, weeklyPackageDownloads] = await Promise.all([
		fetchPackageDownloads({
			packageNames: totalPackageNames,
			startDate: NPM_STATS_START_DATE,
			endDate: totalEndDate,
		}),
		fetchPackageDownloads({
			packageNames: weeklyPackageNames,
			startDate: weeklyStartDate,
			endDate: weeklyEndDate,
		}),
	]);
	const totalDownloads = sumPackageDownloads(totalPackageDownloads, totalPackageNames);
	const weeklyDownloads = sumPackageDownloads(weeklyPackageDownloads, weeklyPackageNames);
	const librarySummaries = libraryPackageEntries.map((entry) => ({
		libraryId: entry.libraryId,
		packageCount: entry.packageNames.length,
		totalDownloads: sumPackageDownloads(totalPackageDownloads, entry.packageNames),
		updatedAt,
	}));

	const summary: HomepageNpmStatsSummary = {
		expiresAt: updatedAt + HOME_NPM_STATS_TTL_MS,
		librarySummaries,
		totalDownloads,
		totalEndDate,
		totalPackageCount: totalPackageNames.length,
		totalStartDate: NPM_STATS_START_DATE,
		updatedAt,
		weeklyDownloads,
		weeklyEndDate,
		weeklyPackageCount: weeklyPackageNames.length,
		weeklyRatePerDay: weeklyDownloads > 0 ? weeklyDownloads / 7 : 0,
		weeklyStartDate,
	};

	await writeHomepageNpmStatsSummary(summary);

	return summary;
}

export async function getHomepageNpmStatsSummary() {
	return (await readHomepageNpmStatsSummary({ allowStale: true })) ?? null;
}

export async function getCachedLibraryNpmStatsSummary(libraryId: string) {
	const summary = await readHomepageNpmStatsSummary({ allowStale: true });

	return (
		summary?.librarySummaries.find((librarySummary) => librarySummary.libraryId === libraryId) ??
		null
	);
}
