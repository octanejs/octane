import {
	getBlobStorage,
	getBlobStorageCache,
	type BlobStorage,
	type BlobStorageCache,
	type BlobStorageListedObject,
} from '~/server/runtime/blob-storage.server';
import { getNpmDailyDownloadData } from './npm-download-ranges';

export interface NpmDownloadChunkData {
	packageName: string;
	dateFrom: string;
	dateTo: string;
	binSize: string;
	totalDownloads: number;
	dailyData: Array<{ day: string; downloads: number }>;
	isImmutable: boolean;
}

type NpmDownloadChunkWithMetadata = NpmDownloadChunkData & {
	createdAt?: string;
	expiresAt?: string;
	updatedAt?: string;
};

type NpmDownloadChunkRequest = {
	packageName: string;
	dateFrom: string;
	dateTo: string;
	binSize: string;
};

type StoredNpmDownloadChunk = {
	dailyData: Array<{ day: string; downloads: number }>;
};

type ParsedNpmDownloadChunkKey = {
	binSize: string;
	dateFrom: string;
	dateTo: string;
	packageName: string;
};

const NPM_DOWNLOAD_BLOB_STORAGE = 'npmDownloadCache';
const NPM_DOWNLOAD_CACHE_PREFIX = 'npm-downloads/v1';
const STORED_CONTENT_TYPE = 'application/json; charset=utf-8';
const MUTABLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let blobStoragePromise: Promise<BlobStorage | undefined> | undefined;

function getNpmDownloadBlobStorage() {
	blobStoragePromise ??= getBlobStorage(NPM_DOWNLOAD_BLOB_STORAGE);
	return blobStoragePromise;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isStoredNpmDownloadChunk(value: unknown): value is StoredNpmDownloadChunk {
	if (!isObject(value)) {
		return false;
	}

	const dailyData = Reflect.get(value, 'dailyData');
	return Array.isArray(dailyData) && getNpmDailyDownloadData(dailyData).length === dailyData.length;
}

function readStoredNpmDownloadChunk(text: string) {
	let parsed: unknown;

	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}

	return isStoredNpmDownloadChunk(parsed) ? parsed : undefined;
}

function readMetadataString(metadata: Record<string, string> | undefined, key: string) {
	const value = metadata?.[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readMetadataBoolean(metadata: Record<string, string> | undefined, key: string) {
	const value = readMetadataString(metadata, key);

	if (value === 'true') return true;
	if (value === 'false') return false;

	return undefined;
}

function readMetadataNumber(metadata: Record<string, string> | undefined, key: string) {
	const value = readMetadataString(metadata, key);
	if (!value) return undefined;

	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
}

function encodeKeySegment(value: string) {
	return encodeURIComponent(value);
}

function decodeKeySegment(value: string) {
	try {
		return decodeURIComponent(value);
	} catch {
		return undefined;
	}
}

function getNpmDownloadChunkKey(req: NpmDownloadChunkRequest) {
	return `${NPM_DOWNLOAD_CACHE_PREFIX}/${encodeKeySegment(
		req.binSize,
	)}/${encodeKeySegment(req.packageName)}/${req.dateFrom}/${req.dateTo}.json`;
}

function getNpmDownloadPackagePrefix({
	binSize,
	packageName,
}: Pick<NpmDownloadChunkRequest, 'binSize' | 'packageName'>) {
	return `${NPM_DOWNLOAD_CACHE_PREFIX}/${encodeKeySegment(
		binSize,
	)}/${encodeKeySegment(packageName)}/`;
}

function getNpmDownloadRangeStartPrefix(req: NpmDownloadChunkRequest) {
	return `${getNpmDownloadPackagePrefix(req)}${req.dateFrom}/`;
}

function parseNpmDownloadChunkKey(key: string): ParsedNpmDownloadChunkKey | undefined {
	const parts = key.split('/');

	if (
		parts.length !== 6 ||
		parts[0] !== 'npm-downloads' ||
		parts[1] !== 'v1' ||
		!parts[5].endsWith('.json')
	) {
		return undefined;
	}

	const binSize = decodeKeySegment(parts[2]);
	const packageName = decodeKeySegment(parts[3]);
	const dateFrom = parts[4];
	const dateTo = parts[5].slice(0, -'.json'.length);

	if (!binSize || !packageName || !dateFrom || !dateTo) {
		return undefined;
	}

	return {
		binSize,
		dateFrom,
		dateTo,
		packageName,
	};
}

function toIsoDayUtc(date: Date) {
	return date.toISOString().slice(0, 10);
}

function getIsImmutable(dateTo: string) {
	return dateTo < toIsoDayUtc(new Date());
}

function getMutableExpiresAt(now: Date) {
	return new Date(now.getTime() + MUTABLE_CACHE_TTL_MS).toISOString();
}

function isFreshChunk(chunk: NpmDownloadChunkWithMetadata) {
	if (chunk.isImmutable) {
		return true;
	}

	if (!chunk.expiresAt) {
		return false;
	}

	return new Date(chunk.expiresAt).getTime() > Date.now();
}

function createChunkMetadata(data: NpmDownloadChunkData, now: Date): Record<string, string> {
	const isImmutable = getIsImmutable(data.dateTo);
	const updatedAt = now.toISOString();
	const metadata: Record<string, string> = {
		binSize: data.binSize,
		createdAt: updatedAt,
		dateFrom: data.dateFrom,
		dateTo: data.dateTo,
		isImmutable: String(isImmutable),
		packageName: data.packageName,
		totalDownloads: String(data.totalDownloads),
		updatedAt,
	};

	if (!isImmutable) {
		metadata.expiresAt = getMutableExpiresAt(now);
	}

	return metadata;
}

function parseStoredChunk({
	key,
	metadata,
	text,
	uploaded,
}: {
	key: string;
	metadata: Record<string, string> | undefined;
	text: string;
	uploaded?: Date;
}): NpmDownloadChunkWithMetadata | undefined {
	const parsedKey = parseNpmDownloadChunkKey(key);
	const stored = readStoredNpmDownloadChunk(text);

	if (!parsedKey || !stored) {
		return undefined;
	}

	const packageName = readMetadataString(metadata, 'packageName');
	const dateFrom = readMetadataString(metadata, 'dateFrom');
	const dateTo = readMetadataString(metadata, 'dateTo');
	const binSize = readMetadataString(metadata, 'binSize');
	const totalDownloads = readMetadataNumber(metadata, 'totalDownloads');
	const isImmutable =
		readMetadataBoolean(metadata, 'isImmutable') ?? getIsImmutable(parsedKey.dateTo);
	const updatedAt = readMetadataString(metadata, 'updatedAt') ?? uploaded?.toISOString();
	const createdAt = readMetadataString(metadata, 'createdAt') ?? uploaded?.toISOString();

	return {
		packageName: packageName ?? parsedKey.packageName,
		dateFrom: dateFrom ?? parsedKey.dateFrom,
		dateTo: dateTo ?? parsedKey.dateTo,
		binSize: binSize ?? parsedKey.binSize,
		totalDownloads:
			totalDownloads ?? stored.dailyData.reduce((sum, point) => sum + point.downloads, 0),
		dailyData: stored.dailyData,
		isImmutable,
		createdAt,
		expiresAt: readMetadataString(metadata, 'expiresAt'),
		updatedAt,
	};
}

async function putCacheEntry(
	cache: BlobStorageCache | undefined,
	key: string,
	text: string,
	metadata: Record<string, string>,
) {
	try {
		await cache?.put(key, {
			metadata,
			text,
		});
	} catch (error) {
		console.warn('[NPM Download R2] Cache API write failed:', error);
	}
}

function createChunkCacheMetadata(chunk: NpmDownloadChunkWithMetadata): Record<string, string> {
	const metadata: Record<string, string> = {
		binSize: chunk.binSize,
		dateFrom: chunk.dateFrom,
		dateTo: chunk.dateTo,
		isImmutable: String(chunk.isImmutable),
		packageName: chunk.packageName,
		totalDownloads: String(chunk.totalDownloads),
	};

	if (chunk.createdAt) {
		metadata.createdAt = chunk.createdAt;
	}

	if (chunk.expiresAt) {
		metadata.expiresAt = chunk.expiresAt;
	}

	if (chunk.updatedAt) {
		metadata.updatedAt = chunk.updatedAt;
	}

	return metadata;
}

async function readBlobChunk({
	allowStale,
	cache,
	key,
	storage,
}: {
	allowStale?: boolean;
	cache: BlobStorageCache | undefined;
	key: string;
	storage: BlobStorage;
}) {
	const cached = await cache?.get(key);

	if (cached) {
		const cachedChunk = parseStoredChunk({
			key,
			metadata: cached.metadata,
			text: cached.text,
		});

		if (cachedChunk && (allowStale || isFreshChunk(cachedChunk))) {
			return cachedChunk;
		}
	}

	const object = await storage.get(key);
	if (!object) {
		return undefined;
	}

	const text = await object.text();
	const chunk = parseStoredChunk({
		key: object.key,
		metadata: object.metadata,
		text,
		uploaded: object.uploaded,
	});

	if (!chunk) {
		return undefined;
	}

	if (!allowStale && !isFreshChunk(chunk)) {
		return undefined;
	}

	await putCacheEntry(cache, key, text, createChunkCacheMetadata(chunk));

	return chunk;
}

async function listBlobObjects(
	storage: BlobStorage,
	prefix: string,
): Promise<Array<BlobStorageListedObject>> {
	const objects: Array<BlobStorageListedObject> = [];
	let cursor: string | undefined;

	do {
		const result = await storage.list({
			cursor,
			limit: 1000,
			prefix,
		});

		objects.push(...result.objects);
		cursor = result.cursor;

		if (!result.truncated) {
			break;
		}
	} while (cursor);

	return objects;
}

function getListedObjectChunkKey(object: BlobStorageListedObject) {
	return parseNpmDownloadChunkKey(object.key);
}

function sortListedObjectsByNewestRangeEnd(a: BlobStorageListedObject, b: BlobStorageListedObject) {
	const aKey = getListedObjectChunkKey(a);
	const bKey = getListedObjectChunkKey(b);

	const dateCompare = (bKey?.dateTo ?? '').localeCompare(aKey?.dateTo ?? '');
	if (dateCompare !== 0) {
		return dateCompare;
	}

	return (b.uploaded?.getTime() ?? 0) - (a.uploaded?.getTime() ?? 0);
}

async function getLegacyNpmDownloadCache() {
	return import('./stats-db.server');
}

async function putBlobChunk(data: NpmDownloadChunkData) {
	const storage = await getNpmDownloadBlobStorage();
	if (!storage) {
		return false;
	}

	const now = new Date();
	const key = getNpmDownloadChunkKey(data);
	const metadata = createChunkMetadata(data, now);
	const dailyData = getNpmDailyDownloadData(data.dailyData);
	const text = JSON.stringify({
		dailyData,
	} satisfies StoredNpmDownloadChunk);
	const cache = getBlobStorageCache(NPM_DOWNLOAD_BLOB_STORAGE);

	await storage.put(key, text, {
		contentType: STORED_CONTENT_TYPE,
		metadata,
	});
	await putCacheEntry(cache, key, text, metadata);

	return true;
}

async function backfillBlobChunk(data: NpmDownloadChunkData | undefined | null) {
	if (!data) {
		return;
	}

	try {
		await putBlobChunk(data);
	} catch (error) {
		console.warn(
			`[NPM Download R2] Backfill failed for ${data.packageName} ${data.dateFrom}:${data.dateTo}:`,
			error,
		);
	}
}

function mapLegacyChunk(chunk: NpmDownloadChunkData): NpmDownloadChunkData {
	return {
		...chunk,
		dailyData: getNpmDailyDownloadData(chunk.dailyData),
	};
}

function getChunkCacheKey(req: NpmDownloadChunkRequest) {
	return `${req.packageName}|${req.dateFrom}|${req.dateTo}|${req.binSize}`;
}

export async function getCachedNpmDownloadChunk(
	packageName: string,
	dateFrom: string,
	dateTo: string,
	binSize: string = 'daily',
): Promise<NpmDownloadChunkData | null> {
	const storage = await getNpmDownloadBlobStorage();

	if (storage) {
		const cache = getBlobStorageCache(NPM_DOWNLOAD_BLOB_STORAGE);
		const chunk = await readBlobChunk({
			cache,
			key: getNpmDownloadChunkKey({ binSize, dateFrom, dateTo, packageName }),
			storage,
		});

		if (chunk) {
			return chunk;
		}
	}

	const legacy = await getLegacyNpmDownloadCache();
	const legacyChunk = await legacy.getCachedNpmDownloadChunk(
		packageName,
		dateFrom,
		dateTo,
		binSize,
	);

	if (legacyChunk) {
		const mapped = mapLegacyChunk(legacyChunk);
		await backfillBlobChunk(mapped);
		return mapped;
	}

	return null;
}

export async function getBatchNpmDownloadChunks(
	requests: Array<NpmDownloadChunkRequest>,
): Promise<Map<string, NpmDownloadChunkWithMetadata>> {
	const results = new Map<string, NpmDownloadChunkWithMetadata>();

	if (requests.length === 0) {
		return results;
	}

	const storage = await getNpmDownloadBlobStorage();

	if (storage) {
		const cache = getBlobStorageCache(NPM_DOWNLOAD_BLOB_STORAGE);
		await Promise.all(
			requests.map(async (req) => {
				const chunk = await readBlobChunk({
					cache,
					key: getNpmDownloadChunkKey(req),
					storage,
				});

				if (chunk) {
					results.set(getChunkCacheKey(req), chunk);
				}
			}),
		);
	}

	const missedRequests = requests.filter((req) => !results.has(getChunkCacheKey(req)));

	if (missedRequests.length === 0) {
		return results;
	}

	const legacy = await getLegacyNpmDownloadCache();
	const legacyChunks = await legacy.getBatchNpmDownloadChunks(missedRequests);

	await Promise.all(
		[...legacyChunks.entries()].map(async ([cacheKey, chunk]) => {
			const mapped = mapLegacyChunk(chunk);
			results.set(cacheKey, {
				...mapped,
				createdAt: chunk.createdAt,
				updatedAt: chunk.updatedAt,
			});
			await backfillBlobChunk(mapped);
		}),
	);

	return results;
}

export async function getLatestNpmDownloadChunksBeforeRangeEnd(
	requests: Array<NpmDownloadChunkRequest>,
): Promise<Map<string, NpmDownloadChunkWithMetadata>> {
	const results = new Map<string, NpmDownloadChunkWithMetadata>();

	if (requests.length === 0) {
		return results;
	}

	const storage = await getNpmDownloadBlobStorage();

	if (storage) {
		const cache = getBlobStorageCache(NPM_DOWNLOAD_BLOB_STORAGE);

		await Promise.all(
			requests.map(async (req) => {
				const objects = await listBlobObjects(storage, getNpmDownloadRangeStartPrefix(req));
				const candidates = objects
					.filter((object) => {
						const parsed = getListedObjectChunkKey(object);
						return (
							parsed?.packageName === req.packageName &&
							parsed.binSize === req.binSize &&
							parsed.dateFrom === req.dateFrom &&
							parsed.dateTo <= req.dateTo
						);
					})
					.sort(sortListedObjectsByNewestRangeEnd);

				for (const candidate of candidates) {
					const chunk = await readBlobChunk({
						allowStale: true,
						cache,
						key: candidate.key,
						storage,
					});

					if (chunk) {
						results.set(getChunkCacheKey(req), chunk);
						break;
					}
				}
			}),
		);
	}

	const missedRequests = requests.filter((req) => !results.has(getChunkCacheKey(req)));

	if (missedRequests.length === 0) {
		return results;
	}

	const legacy = await getLegacyNpmDownloadCache();
	const legacyChunks = await legacy.getLatestNpmDownloadChunksBeforeRangeEnd(missedRequests);

	await Promise.all(
		[...legacyChunks.entries()].map(async ([cacheKey, chunk]) => {
			const mapped = mapLegacyChunk(chunk);
			results.set(cacheKey, {
				...mapped,
				createdAt: chunk.createdAt,
				updatedAt: chunk.updatedAt,
			});
			await backfillBlobChunk(mapped);
		}),
	);

	return results;
}

export async function getLatestNpmDownloadChunksCoveringRange({
	dateFrom,
	dateTo,
	packageNames,
}: {
	dateFrom: string;
	dateTo: string;
	packageNames: Array<string>;
}): Promise<Map<string, NpmDownloadChunkData>> {
	const results = new Map<string, NpmDownloadChunkData>();

	if (packageNames.length === 0) {
		return results;
	}

	const storage = await getNpmDownloadBlobStorage();

	if (storage) {
		const cache = getBlobStorageCache(NPM_DOWNLOAD_BLOB_STORAGE);

		await Promise.all(
			packageNames.map(async (packageName) => {
				const objects = await listBlobObjects(
					storage,
					getNpmDownloadPackagePrefix({
						binSize: 'daily',
						packageName,
					}),
				);
				const candidates = objects
					.filter((object) => {
						const parsed = getListedObjectChunkKey(object);
						return (
							parsed?.packageName === packageName &&
							parsed.binSize === 'daily' &&
							parsed.dateFrom <= dateFrom &&
							parsed.dateTo >= dateTo
						);
					})
					.sort(sortListedObjectsByNewestRangeEnd);

				for (const candidate of candidates) {
					const chunk = await readBlobChunk({
						allowStale: true,
						cache,
						key: candidate.key,
						storage,
					});

					if (chunk) {
						results.set(packageName, chunk);
						break;
					}
				}
			}),
		);
	}

	const missedPackageNames = packageNames.filter((packageName) => !results.has(packageName));

	if (missedPackageNames.length === 0) {
		return results;
	}

	const legacy = await getLegacyNpmDownloadCache();
	const legacyChunks = await legacy.getLatestNpmDownloadChunksCoveringRange({
		dateFrom,
		dateTo,
		packageNames: missedPackageNames,
	});

	await Promise.all(
		[...legacyChunks.entries()].map(async ([packageName, chunk]) => {
			const mapped = mapLegacyChunk(chunk);
			results.set(packageName, mapped);
			await backfillBlobChunk(mapped);
		}),
	);

	return results;
}

export async function setCachedNpmDownloadChunk(data: NpmDownloadChunkData): Promise<void> {
	try {
		const wroteBlob = await putBlobChunk(data);

		if (wroteBlob) {
			return;
		}
	} catch (error) {
		console.error(
			`[NPM Download R2] Error caching ${data.packageName} ${data.dateFrom}:${data.dateTo}:`,
			error,
		);
	}

	const legacy = await getLegacyNpmDownloadCache();
	await legacy.setCachedNpmDownloadChunk(data);
}
