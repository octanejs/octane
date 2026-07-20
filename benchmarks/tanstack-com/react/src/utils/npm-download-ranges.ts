import type { NpmDailyDownload } from './npm-download-outliers';

export const NPM_STATS_START_DATE = '2015-01-10';

type NpmDownloadRange = {
	from: string;
	to: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function toIsoDayUtc(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function addUtcDays(day: string, amount: number): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + amount);
	return toIsoDayUtc(date);
}

export function getInclusiveUtcDayCount(startDay: string, endDay: string) {
	const start = new Date(`${startDay}T00:00:00.000Z`).getTime();
	const end = new Date(`${endDay}T00:00:00.000Z`).getTime();
	const dayInMs = 24 * 60 * 60 * 1000;

	return Math.floor((end - start) / dayInMs) + 1;
}

export function hasCompleteDailyCoverage(
	downloads: Array<NpmDailyDownload>,
	startDay: string,
	endDay: string,
) {
	if (downloads.length !== getInclusiveUtcDayCount(startDay, endDay)) {
		return false;
	}

	return downloads[0]?.day === startDay && downloads.at(-1)?.day === endDay;
}

export function isNpmDailyDownload(value: unknown): value is NpmDailyDownload {
	return (
		isObject(value) &&
		typeof Reflect.get(value, 'day') === 'string' &&
		typeof Reflect.get(value, 'downloads') === 'number'
	);
}

export function getNpmDailyDownloadData(value: unknown) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(isNpmDailyDownload);
}

export function getNpmDailyDownloadsFromResponse(value: unknown) {
	if (!isObject(value)) {
		return [];
	}

	return getNpmDailyDownloadData(Reflect.get(value, 'downloads'));
}

export function getNpmDownloadResponseError(value: unknown) {
	if (!isObject(value)) {
		return undefined;
	}

	const error = Reflect.get(value, 'error');
	return typeof error === 'string' ? error : undefined;
}

export function getNormalizedNpmDownloadChunks({
	endDate,
	startDate,
	today = toIsoDayUtc(new Date()),
}: {
	endDate: string;
	startDate: string;
	today?: string;
}): Array<NpmDownloadRange> {
	const boundedStart = startDate < NPM_STATS_START_DATE ? NPM_STATS_START_DATE : startDate;
	const boundedEnd = endDate > today ? today : endDate;

	if (boundedStart > boundedEnd) {
		return [];
	}

	const startYear = new Date(`${boundedStart}T00:00:00.000Z`).getUTCFullYear();
	const endYear = new Date(`${boundedEnd}T00:00:00.000Z`).getUTCFullYear();
	const chunks: Array<NpmDownloadRange> = [];

	for (let year = startYear; year <= endYear; year++) {
		const yearStart = `${year}-01-01`;
		const yearEnd = `${year}-12-31`;
		const from = yearStart < NPM_STATS_START_DATE ? NPM_STATS_START_DATE : yearStart;
		const to = yearEnd > today ? today : yearEnd;

		if (to < boundedStart || from > boundedEnd) {
			continue;
		}

		chunks.push({ from, to });
	}

	return chunks;
}
