import {
	getBlobStorage,
	getBlobStorageCache,
	type BlobStorage,
	type BlobStorageCache,
	type BlobStorageListedObject,
} from '~/server/runtime/blob-storage.server';
import { scheduleHostRuntimeTask } from '~/server/runtime/host.server';
import { isValidRepoPath, MAX_REPO_PATH_LENGTH } from './repo-path';

const POSITIVE_STALE_MS = 5 * 60 * 1000;
const NEGATIVE_STALE_MS = 15 * 60 * 1000;

const DEFAULT_PRUNE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_NEGATIVE_PRUNE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const GITHUB_CONTENT_BLOB_STORAGE = 'githubContentCache';
const STORED_CONTENT_TYPE = 'application/json; charset=utf-8';
const EPOCH_ISO = new Date(0).toISOString();
const MAX_MEMORY_CACHE_ENTRIES = 300;

// Internal sentinel path used for recursive repository tree metadata. Allowed
// alongside normal repo paths.
const SENTINEL_PATHS = new Set(['__github_recursive_tree__']);

const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
// Git refs allow a fairly wide character set, but we restrict to the subset
// we actually publish from (branch names + tags). No spaces, no shell
// metacharacters, no path traversal.
const GIT_REF_PATTERN = /^[a-zA-Z0-9._/-]+$/;
const ARTIFACT_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;

const MAX_REPO_LEN = 100;
const MAX_GIT_REF_LEN = 100;
const MAX_ARTIFACT_TYPE_LEN = 50;
const MAX_ARTIFACT_KEY_LEN = 255;

type ContentKind = 'dir' | 'file';
type CachedValue<T> = T | null | undefined;

type GithubContentKey = {
	contentKind: ContentKind;
	gitRef: string;
	path: string;
	repo: string;
};

type GithubContentRecord = GithubContentKey & {
	isPresent: boolean;
	jsonContent?: unknown;
	staleAt: Date;
	textContent?: string;
	updatedAt: Date;
};

type DocsArtifactKey = {
	artifactKey: string;
	artifactType: string;
	docsRoot: string;
	gitRef: string;
	repo: string;
};

type DocsArtifactRecord = DocsArtifactKey & {
	payload: unknown;
	staleAt: Date;
	updatedAt: Date;
};

type StoredBlob = {
	metadata: Record<string, string>;
	text: string;
	value: unknown;
};

type PruneResult = {
	cutoff: Date;
	docsArtifactDeleted: number;
	githubContentDeleted: number;
	githubContentNegativesDeleted: number;
	negativeCutoff: Date;
};

export type DocsCacheRepoStats = {
	artifactEntries: number;
	cachedRefCount: number;
	contentEntries: number;
	lastUpdatedAt: string | null;
	repo: string;
	staleArtifactEntries: number;
	staleContentEntries: number;
	staleEntries: number;
	totalEntries: number;
};

type RepoStatsAccumulator = {
	artifactEntries: number;
	contentEntries: number;
	lastUpdatedAt: Date | null;
	refs: Set<string>;
	repo: string;
	staleArtifactEntries: number;
	staleContentEntries: number;
};

type MemoryCacheEntry = {
	cache: 'artifact' | 'content';
	key: string;
	updatedAt: Date;
};

type CacheBackend = {
	getDocsArtifact: (key: DocsArtifactKey) => Promise<DocsArtifactRecord | undefined>;
	getGitHubContent: (key: GithubContentKey) => Promise<GithubContentRecord | undefined>;
	listRepoStats: () => Promise<Array<DocsCacheRepoStats>>;
	markDocsArtifactsStale: (opts: { gitRef?: string; repo?: string }) => Promise<number>;
	markGitHubContentStale: (opts: { gitRef?: string; repo?: string }) => Promise<number>;
	pruneStaleCacheRows: (opts: {
		maxAgeMs?: number;
		negativeMaxAgeMs?: number;
	}) => Promise<PruneResult>;
	putDocsArtifact: (record: DocsArtifactRecord) => Promise<void>;
	putGitHubContent: (record: GithubContentRecord) => Promise<void>;
};

export class InvalidCacheKeyError extends Error {
	constructor(field: string, value: string) {
		super(`Refusing to cache: invalid ${field}=${JSON.stringify(value).slice(0, 80)}`);
		this.name = 'InvalidCacheKeyError';
	}
}

const pendingRefreshes = new Map<string, Promise<void>>();
const memoryGitHubContent = new Map<string, GithubContentRecord>();
const memoryDocsArtifacts = new Map<string, DocsArtifactRecord>();
let blobBackend: CacheBackend | undefined;

function assertValidRepo(repo: string) {
	if (repo.length === 0 || repo.length > MAX_REPO_LEN || !REPO_PATTERN.test(repo)) {
		throw new InvalidCacheKeyError('repo', repo);
	}
}

function assertValidGitRef(gitRef: string) {
	if (
		gitRef.length === 0 ||
		gitRef.length > MAX_GIT_REF_LEN ||
		!GIT_REF_PATTERN.test(gitRef) ||
		gitRef.includes('..') ||
		gitRef.startsWith('/') ||
		gitRef.endsWith('/') ||
		gitRef.includes('//')
	) {
		throw new InvalidCacheKeyError('gitRef', gitRef);
	}
}

function assertValidContentPath(path: string) {
	if (path === '' || SENTINEL_PATHS.has(path)) {
		return;
	}

	if (path.length > MAX_REPO_PATH_LENGTH) {
		throw new InvalidCacheKeyError('path', path);
	}

	if (!isValidRepoPath(path)) {
		throw new InvalidCacheKeyError('path', path);
	}
}

function assertValidArtifactId(field: string, value: string, maxLength: number) {
	if (value.length === 0 || value.length > maxLength || !ARTIFACT_ID_PATTERN.test(value)) {
		throw new InvalidCacheKeyError(field, value);
	}
}

function assertValidGithubContentKey(opts: GithubContentKey) {
	assertValidRepo(opts.repo);
	assertValidGitRef(opts.gitRef);
	assertValidContentPath(opts.path);
}

function assertValidDocsArtifactKey(opts: DocsArtifactKey) {
	assertValidRepo(opts.repo);
	assertValidGitRef(opts.gitRef);
	assertValidContentPath(opts.docsRoot);
	assertValidArtifactId('artifactType', opts.artifactType, MAX_ARTIFACT_TYPE_LEN);
	assertValidArtifactId('artifactKey', opts.artifactKey, MAX_ARTIFACT_KEY_LEN);
}

async function withPendingRefresh<T>(key: string, fn: () => Promise<T>) {
	const pending = pendingRefreshes.get(key);

	if (pending) {
		await pending;
		return fn();
	}

	const promise = fn();

	pendingRefreshes.set(
		key,
		promise.then(
			() => undefined,
			() => undefined,
		),
	);

	try {
		return await promise;
	} finally {
		pendingRefreshes.delete(key);
	}
}

function createFreshnessWindow(isPresent: boolean) {
	const now = Date.now();
	const staleFor = isPresent ? POSITIVE_STALE_MS : NEGATIVE_STALE_MS;

	return {
		staleAt: new Date(now + staleFor),
	};
}

function isFresh(staleAt: Date) {
	return staleAt.getTime() > Date.now();
}

// markGitHubContentStale / markDocsArtifactsStale set staleAt to the epoch
// (new Date(0)) as a sentinel for "forcibly invalidated": an admin clicked
// the purge button or a push webhook fired. The object stays around so refresh
// paths can still fall back to it if GitHub is unreachable, and docs artifacts
// can serve it while scheduling a background rebuild when the runtime supports
// waitUntil.
function isForciblyStale(staleAt: Date) {
	return staleAt.getTime() <= 0;
}

function encodeKeySegment(value: string) {
	return encodeURIComponent(value);
}

function getGitHubContentBlobKey(opts: GithubContentKey) {
	const prefix = opts.contentKind === 'file' ? 'github:file' : 'github:dir';
	return `${prefix}/${opts.repo}/${encodeKeySegment(opts.gitRef)}/${opts.path}`;
}

function getDocsArtifactBlobKey(opts: DocsArtifactKey) {
	return `docs-artifact/${opts.repo}/${encodeKeySegment(opts.gitRef)}/${opts.docsRoot}/${encodeKeySegment(opts.artifactType)}/${encodeKeySegment(opts.artifactKey)}`;
}

function getGitHubContentPrefixes(opts: { gitRef?: string; repo?: string }) {
	const kinds: Array<ContentKind> = ['file', 'dir'];
	const prefixes = kinds.map((contentKind) =>
		contentKind === 'file' ? 'github:file' : 'github:dir',
	);
	const repo = opts.repo;
	const gitRef = opts.gitRef;

	if (repo && gitRef) {
		return prefixes.map((prefix) => `${prefix}/${repo}/${encodeKeySegment(gitRef)}/`);
	}

	if (repo) {
		return prefixes.map((prefix) => `${prefix}/${repo}/`);
	}

	return prefixes.map((prefix) => `${prefix}/`);
}

function getDocsArtifactPrefixes(opts: { gitRef?: string; repo?: string }) {
	if (opts.repo && opts.gitRef) {
		return [`docs-artifact/${opts.repo}/${encodeKeySegment(opts.gitRef)}/`];
	}

	if (opts.repo) {
		return [`docs-artifact/${opts.repo}/`];
	}

	return ['docs-artifact/'];
}

function createStoredText(value: unknown) {
	if (value === undefined) {
		throw new Error('Cannot cache undefined GitHub content');
	}

	return JSON.stringify({
		value,
	});
}

function readStoredValue(text: string) {
	let parsed: unknown;

	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}

	if (typeof parsed !== 'object' || parsed === null || !('value' in parsed)) {
		return undefined;
	}

	return parsed.value;
}

function readMetadataString(metadata: Record<string, string> | undefined, key: string) {
	const value = metadata?.[key];
	return typeof value === 'string' ? value : undefined;
}

function readMetadataBoolean(metadata: Record<string, string> | undefined, key: string) {
	const value = readMetadataString(metadata, key);

	if (value === 'true') {
		return true;
	}

	if (value === 'false') {
		return false;
	}

	return undefined;
}

function readMetadataDate(metadata: Record<string, string> | undefined, key: string) {
	const value = readMetadataString(metadata, key);

	if (!value) {
		return undefined;
	}

	const date = new Date(value);

	return Number.isNaN(date.getTime()) ? undefined : date;
}

function readMetadataContentKind(
	metadata: Record<string, string> | undefined,
): ContentKind | undefined {
	const value = readMetadataString(metadata, 'contentKind');

	if (value === 'dir') {
		return 'dir';
	}

	if (value === 'file') {
		return 'file';
	}

	return undefined;
}

function getRequiredFileContent(value: unknown) {
	if (typeof value === 'string') {
		return value;
	}

	throw new Error('Cannot cache non-string GitHub file content');
}

function getGithubContentMetadata(record: GithubContentRecord) {
	return {
		contentKind: record.contentKind,
		gitRef: record.gitRef,
		isPresent: record.isPresent ? 'true' : 'false',
		path: record.path,
		repo: record.repo,
		staleAt: record.staleAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}

function getDocsArtifactMetadata(record: DocsArtifactRecord) {
	return {
		artifactKey: record.artifactKey,
		artifactType: record.artifactType,
		docsRoot: record.docsRoot,
		gitRef: record.gitRef,
		repo: record.repo,
		staleAt: record.staleAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}

function inferGithubContentMetadataFromBlobKey(key: string, uploaded?: Date) {
	const segments = key.split('/');
	const prefix = segments[0];
	const contentKind = prefix === 'github:file' ? 'file' : prefix === 'github:dir' ? 'dir' : null;

	if (!contentKind || segments.length < 5) {
		return undefined;
	}

	const repo = `${segments[1]}/${segments[2]}`;
	const gitRef = decodeURIComponent(segments[3]);
	const path = segments.slice(4).join('/');
	const updatedAt = uploaded ?? new Date();
	const staleAt = new Date(updatedAt.getTime() + POSITIVE_STALE_MS);

	return {
		contentKind,
		gitRef,
		isPresent: 'true',
		path,
		repo,
		staleAt: staleAt.toISOString(),
		updatedAt: updatedAt.toISOString(),
	};
}

function getStoredBlob(opts: {
	key?: string;
	metadata: Record<string, string> | undefined;
	text: string;
	uploaded?: Date;
}) {
	const value = readStoredValue(opts.text);
	const storedMetadata =
		opts.metadata && Object.keys(opts.metadata).length > 0 ? opts.metadata : undefined;
	const metadata =
		storedMetadata ??
		(opts.key ? inferGithubContentMetadataFromBlobKey(opts.key, opts.uploaded) : undefined);

	if (value === undefined || !metadata) {
		return undefined;
	}

	return {
		metadata,
		text: opts.text,
		value,
	};
}

function readGithubContentRecord(stored: StoredBlob) {
	const repo = readMetadataString(stored.metadata, 'repo');
	const gitRef = readMetadataString(stored.metadata, 'gitRef');
	const path = readMetadataString(stored.metadata, 'path');
	const contentKind = readMetadataContentKind(stored.metadata);
	const isPresent = readMetadataBoolean(stored.metadata, 'isPresent');
	const staleAt = readMetadataDate(stored.metadata, 'staleAt');
	const updatedAt = readMetadataDate(stored.metadata, 'updatedAt');

	if (
		!repo ||
		!gitRef ||
		path === undefined ||
		!contentKind ||
		isPresent === undefined ||
		!staleAt ||
		!updatedAt
	) {
		return undefined;
	}

	return {
		contentKind,
		gitRef,
		isPresent,
		jsonContent: contentKind === 'dir' && isPresent ? stored.value : undefined,
		path,
		repo,
		staleAt,
		textContent:
			contentKind === 'file' && isPresent && typeof stored.value === 'string'
				? stored.value
				: undefined,
		updatedAt,
	};
}

function isNegativeGithubDirectoryBlob(stored: StoredBlob) {
	return (
		readMetadataContentKind(stored.metadata) === 'dir' &&
		readMetadataBoolean(stored.metadata, 'isPresent') === false
	);
}

function readDocsArtifactRecord(stored: StoredBlob) {
	const repo = readMetadataString(stored.metadata, 'repo');
	const gitRef = readMetadataString(stored.metadata, 'gitRef');
	const docsRoot = readMetadataString(stored.metadata, 'docsRoot');
	const artifactType = readMetadataString(stored.metadata, 'artifactType');
	const artifactKey = readMetadataString(stored.metadata, 'artifactKey');
	const staleAt = readMetadataDate(stored.metadata, 'staleAt');
	const updatedAt = readMetadataDate(stored.metadata, 'updatedAt');

	if (
		!repo ||
		!gitRef ||
		docsRoot === undefined ||
		!artifactType ||
		!artifactKey ||
		!staleAt ||
		!updatedAt
	) {
		return undefined;
	}

	return {
		artifactKey,
		artifactType,
		docsRoot,
		gitRef,
		payload: stored.value,
		repo,
		staleAt,
		updatedAt,
	};
}

async function readBlob(storage: BlobStorage, cache: BlobStorageCache | undefined, key: string) {
	const cached = await cache?.get(key);
	const cachedBlob = cached
		? getStoredBlob({ key, metadata: cached.metadata, text: cached.text })
		: undefined;

	if (cachedBlob && !isNegativeGithubDirectoryBlob(cachedBlob)) {
		return cachedBlob;
	}

	const object = await storage.get(key);

	if (!object) {
		return undefined;
	}

	const text = await object.text();
	const stored = getStoredBlob({
		key,
		metadata: object.metadata,
		text,
		uploaded: object.uploaded,
	});

	if (!stored) {
		return undefined;
	}

	await writeBlobCache(cache, key, {
		metadata: stored.metadata,
		text: stored.text,
	});

	return stored;
}

async function writeBlobCache(
	cache: BlobStorageCache | undefined,
	key: string,
	entry: {
		metadata: Record<string, string>;
		text: string;
	},
) {
	try {
		await cache?.put(key, entry);
	} catch {
		// The runtime front cache is opportunistic.
	}
}

async function deleteBlobCache(cache: BlobStorageCache | undefined, key: string) {
	try {
		await cache?.delete(key);
	} catch {
		// The durable blob store remains authoritative.
	}
}

function pruneMemoryCache() {
	const totalEntries = memoryGitHubContent.size + memoryDocsArtifacts.size;

	if (totalEntries <= MAX_MEMORY_CACHE_ENTRIES) {
		return;
	}

	const entries: Array<MemoryCacheEntry> = [
		...Array.from(memoryGitHubContent.entries()).map(
			([key, record]): MemoryCacheEntry => ({
				cache: 'content',
				key,
				updatedAt: record.updatedAt,
			}),
		),
		...Array.from(memoryDocsArtifacts.entries()).map(
			([key, record]): MemoryCacheEntry => ({
				cache: 'artifact',
				key,
				updatedAt: record.updatedAt,
			}),
		),
	].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

	for (const entry of entries.slice(0, totalEntries - MAX_MEMORY_CACHE_ENTRIES)) {
		if (entry.cache === 'content') {
			memoryGitHubContent.delete(entry.key);
		} else {
			memoryDocsArtifacts.delete(entry.key);
		}
	}
}

function readStoredTextValue(row: GithubContentRecord | undefined) {
	if (!row) {
		return undefined;
	}

	if (!row.isPresent) {
		return null;
	}

	return typeof row.textContent === 'string' ? row.textContent : undefined;
}

function readStoredJsonValue<T>(
	row: GithubContentRecord | undefined,
	isValue: (value: unknown) => value is T,
) {
	if (!row) {
		return undefined;
	}

	if (!row.isPresent) {
		return null;
	}

	return isValue(row.jsonContent) ? row.jsonContent : undefined;
}

function canUseStoredGithubContentValue<T>(
	contentKind: ContentKind,
	value: CachedValue<T>,
): value is T | null {
	if (value === undefined) {
		return false;
	}

	// Directory metadata is derived from the GitHub API. A transient API failure
	// used to poison examples with fresh null entries, hiding the file explorer.
	// Revalidate those negative JSON entries on the next read-through.
	return !(contentKind === 'dir' && value === null);
}

function metadataMatches(
	metadata: Record<string, string> | undefined,
	opts: {
		gitRef?: string;
		repo?: string;
	},
) {
	if (!metadata) {
		return false;
	}

	if (opts.repo && readMetadataString(metadata, 'repo') !== opts.repo) {
		return false;
	}

	if (opts.gitRef && readMetadataString(metadata, 'gitRef') !== opts.gitRef) {
		return false;
	}

	return true;
}

async function listBlobObjects(storage: BlobStorage, prefix: string) {
	const objects: Array<BlobStorageListedObject> = [];
	let cursor: string | undefined;

	do {
		const result = await storage.list({
			cursor,
			limit: 1000,
			prefix,
		});

		objects.push(...result.objects);
		cursor = result.truncated ? result.cursor : undefined;
	} while (cursor);

	return objects;
}

async function getListedObjectMetadata(storage: BlobStorage, object: BlobStorageListedObject) {
	if (object.metadata && Object.keys(object.metadata).length > 0) {
		return object.metadata;
	}

	const stored = await readBlob(storage, undefined, object.key);
	return stored?.metadata;
}

async function deleteBlobKeys(
	storage: BlobStorage,
	cache: BlobStorageCache | undefined,
	keys: Array<string>,
) {
	const chunkSize = 1000;

	for (let index = 0; index < keys.length; index += chunkSize) {
		const chunk = keys.slice(index, index + chunkSize);
		await storage.delete(chunk);

		await Promise.all(chunk.map((key) => deleteBlobCache(cache, key)));
	}
}

function getStatsAccumulator(statsByRepo: Map<string, RepoStatsAccumulator>, repo: string) {
	const existing = statsByRepo.get(repo);

	if (existing) {
		return existing;
	}

	const created = {
		artifactEntries: 0,
		contentEntries: 0,
		lastUpdatedAt: null,
		refs: new Set<string>(),
		repo,
		staleArtifactEntries: 0,
		staleContentEntries: 0,
	};

	statsByRepo.set(repo, created);
	return created;
}

function updateLastUpdatedAt(accumulator: RepoStatsAccumulator, updatedAt: Date) {
	if (!accumulator.lastUpdatedAt || updatedAt.getTime() > accumulator.lastUpdatedAt.getTime()) {
		accumulator.lastUpdatedAt = updatedAt;
	}
}

function addGithubContentStats(
	statsByRepo: Map<string, RepoStatsAccumulator>,
	record: Pick<GithubContentRecord, 'gitRef' | 'repo' | 'staleAt' | 'updatedAt'>,
) {
	const accumulator = getStatsAccumulator(statsByRepo, record.repo);
	accumulator.contentEntries += 1;
	accumulator.refs.add(record.gitRef);

	if (!isFresh(record.staleAt)) {
		accumulator.staleContentEntries += 1;
	}

	updateLastUpdatedAt(accumulator, record.updatedAt);
}

function addDocsArtifactStats(
	statsByRepo: Map<string, RepoStatsAccumulator>,
	record: Pick<DocsArtifactRecord, 'gitRef' | 'repo' | 'staleAt' | 'updatedAt'>,
) {
	const accumulator = getStatsAccumulator(statsByRepo, record.repo);
	accumulator.artifactEntries += 1;
	accumulator.refs.add(record.gitRef);

	if (!isFresh(record.staleAt)) {
		accumulator.staleArtifactEntries += 1;
	}

	updateLastUpdatedAt(accumulator, record.updatedAt);
}

function finalizeRepoStats(
	statsByRepo: Map<string, RepoStatsAccumulator>,
): Array<DocsCacheRepoStats> {
	return Array.from(statsByRepo.values())
		.map((repo) => {
			const totalEntries = repo.contentEntries + repo.artifactEntries;
			const staleEntries = repo.staleContentEntries + repo.staleArtifactEntries;

			return {
				artifactEntries: repo.artifactEntries,
				cachedRefCount: repo.refs.size,
				contentEntries: repo.contentEntries,
				lastUpdatedAt: repo.lastUpdatedAt?.toISOString() ?? null,
				repo: repo.repo,
				staleArtifactEntries: repo.staleArtifactEntries,
				staleContentEntries: repo.staleContentEntries,
				staleEntries,
				totalEntries,
			};
		})
		.sort((a, b) => b.totalEntries - a.totalEntries || a.repo.localeCompare(b.repo));
}

function readGithubContentStatsFromMetadata(metadata: Record<string, string> | undefined) {
	const repo = readMetadataString(metadata, 'repo');
	const gitRef = readMetadataString(metadata, 'gitRef');
	const staleAt = readMetadataDate(metadata, 'staleAt');
	const updatedAt = readMetadataDate(metadata, 'updatedAt');
	const isPresent = readMetadataBoolean(metadata, 'isPresent');

	if (!repo || !gitRef || !staleAt || !updatedAt || isPresent === undefined) {
		return undefined;
	}

	return {
		gitRef,
		isPresent,
		repo,
		staleAt,
		updatedAt,
	};
}

function readDocsArtifactStatsFromMetadata(metadata: Record<string, string> | undefined) {
	const repo = readMetadataString(metadata, 'repo');
	const gitRef = readMetadataString(metadata, 'gitRef');
	const staleAt = readMetadataDate(metadata, 'staleAt');
	const updatedAt = readMetadataDate(metadata, 'updatedAt');

	if (!repo || !gitRef || !staleAt || !updatedAt) {
		return undefined;
	}

	return {
		gitRef,
		repo,
		staleAt,
		updatedAt,
	};
}

function createMemoryBackend(): CacheBackend {
	return {
		async getDocsArtifact(key) {
			return memoryDocsArtifacts.get(getDocsArtifactBlobKey(key));
		},
		async getGitHubContent(key) {
			return memoryGitHubContent.get(getGitHubContentBlobKey(key));
		},
		async listRepoStats() {
			const statsByRepo = new Map<string, RepoStatsAccumulator>();

			for (const record of memoryGitHubContent.values()) {
				addGithubContentStats(statsByRepo, record);
			}

			for (const record of memoryDocsArtifacts.values()) {
				addDocsArtifactStats(statsByRepo, record);
			}

			return finalizeRepoStats(statsByRepo);
		},
		async markDocsArtifactsStale(opts) {
			let count = 0;

			for (const [key, record] of memoryDocsArtifacts.entries()) {
				if (!metadataMatches(getDocsArtifactMetadata(record), opts)) {
					continue;
				}

				memoryDocsArtifacts.set(key, {
					...record,
					staleAt: new Date(0),
				});
				count += 1;
			}

			return count;
		},
		async markGitHubContentStale(opts) {
			let count = 0;

			for (const [key, record] of memoryGitHubContent.entries()) {
				if (!metadataMatches(getGithubContentMetadata(record), opts)) {
					continue;
				}

				memoryGitHubContent.set(key, {
					...record,
					staleAt: new Date(0),
				});
				count += 1;
			}

			return count;
		},
		async pruneStaleCacheRows(opts) {
			const maxAgeMs = opts.maxAgeMs ?? DEFAULT_PRUNE_MAX_AGE_MS;
			const negativeMaxAgeMs = opts.negativeMaxAgeMs ?? DEFAULT_NEGATIVE_PRUNE_MAX_AGE_MS;
			const cutoff = new Date(Date.now() - maxAgeMs);
			const negativeCutoff = new Date(Date.now() - negativeMaxAgeMs);
			let githubContentDeleted = 0;
			let githubContentNegativesDeleted = 0;
			let docsArtifactDeleted = 0;

			for (const [key, record] of memoryGitHubContent.entries()) {
				const shouldDeleteByAge = record.updatedAt < cutoff;
				const shouldDeleteNegative = !record.isPresent && record.updatedAt < negativeCutoff;

				if (!shouldDeleteByAge && !shouldDeleteNegative) {
					continue;
				}

				memoryGitHubContent.delete(key);
				githubContentDeleted += 1;

				if (shouldDeleteNegative) {
					githubContentNegativesDeleted += 1;
				}
			}

			for (const [key, record] of memoryDocsArtifacts.entries()) {
				if (record.updatedAt >= cutoff) {
					continue;
				}

				memoryDocsArtifacts.delete(key);
				docsArtifactDeleted += 1;
			}

			return {
				cutoff,
				docsArtifactDeleted,
				githubContentDeleted,
				githubContentNegativesDeleted,
				negativeCutoff,
			};
		},
		async putDocsArtifact(record) {
			memoryDocsArtifacts.set(getDocsArtifactBlobKey(record), record);
			pruneMemoryCache();
		},
		async putGitHubContent(record) {
			memoryGitHubContent.set(getGitHubContentBlobKey(record), record);
			pruneMemoryCache();
		},
	};
}

function createBlobBackend(
	storage: BlobStorage,
	cache: BlobStorageCache | undefined,
): CacheBackend {
	return {
		async getDocsArtifact(key) {
			const stored = await readBlob(storage, cache, getDocsArtifactBlobKey(key));
			return stored ? readDocsArtifactRecord(stored) : undefined;
		},
		async getGitHubContent(key) {
			const stored = await readBlob(storage, cache, getGitHubContentBlobKey(key));
			return stored ? readGithubContentRecord(stored) : undefined;
		},
		async listRepoStats() {
			const statsByRepo = new Map<string, RepoStatsAccumulator>();

			for (const prefix of getGitHubContentPrefixes({})) {
				const objects = await listBlobObjects(storage, prefix);

				for (const object of objects) {
					const metadata = await getListedObjectMetadata(storage, object);
					const stats = readGithubContentStatsFromMetadata(metadata);

					if (stats) {
						addGithubContentStats(statsByRepo, stats);
					}
				}
			}

			for (const object of await listBlobObjects(storage, 'docs-artifact/')) {
				const metadata = await getListedObjectMetadata(storage, object);
				const stats = readDocsArtifactStatsFromMetadata(metadata);

				if (stats) {
					addDocsArtifactStats(statsByRepo, stats);
				}
			}

			return finalizeRepoStats(statsByRepo);
		},
		async markDocsArtifactsStale(opts) {
			return markBlobObjectsStale({
				cache,
				matches: (metadata) => metadataMatches(metadata, opts),
				prefixes: getDocsArtifactPrefixes(opts),
				storage,
			});
		},
		async markGitHubContentStale(opts) {
			return markBlobObjectsStale({
				cache,
				matches: (metadata) => metadataMatches(metadata, opts),
				prefixes: getGitHubContentPrefixes(opts),
				storage,
			});
		},
		async pruneStaleCacheRows(opts) {
			const maxAgeMs = opts.maxAgeMs ?? DEFAULT_PRUNE_MAX_AGE_MS;
			const negativeMaxAgeMs = opts.negativeMaxAgeMs ?? DEFAULT_NEGATIVE_PRUNE_MAX_AGE_MS;
			const cutoff = new Date(Date.now() - maxAgeMs);
			const negativeCutoff = new Date(Date.now() - negativeMaxAgeMs);
			const githubContentDeleteKeys = new Set<string>();
			const githubContentNegativeDeleteKeys = new Set<string>();
			const docsArtifactDeleteKeys = new Set<string>();

			for (const prefix of getGitHubContentPrefixes({})) {
				const objects = await listBlobObjects(storage, prefix);

				for (const object of objects) {
					const metadata = await getListedObjectMetadata(storage, object);
					const stats = readGithubContentStatsFromMetadata(metadata);

					if (!stats) {
						continue;
					}

					if (stats.updatedAt < cutoff) {
						githubContentDeleteKeys.add(object.key);
					}

					if (!stats.isPresent && stats.updatedAt < negativeCutoff) {
						githubContentDeleteKeys.add(object.key);
						githubContentNegativeDeleteKeys.add(object.key);
					}
				}
			}

			for (const object of await listBlobObjects(storage, 'docs-artifact/')) {
				const metadata = await getListedObjectMetadata(storage, object);
				const stats = readDocsArtifactStatsFromMetadata(metadata);

				if (stats && stats.updatedAt < cutoff) {
					docsArtifactDeleteKeys.add(object.key);
				}
			}

			await Promise.all([
				deleteBlobKeys(storage, cache, Array.from(githubContentDeleteKeys)),
				deleteBlobKeys(storage, cache, Array.from(docsArtifactDeleteKeys)),
			]);

			return {
				cutoff,
				docsArtifactDeleted: docsArtifactDeleteKeys.size,
				githubContentDeleted: githubContentDeleteKeys.size,
				githubContentNegativesDeleted: githubContentNegativeDeleteKeys.size,
				negativeCutoff,
			};
		},
		async putDocsArtifact(record) {
			const key = getDocsArtifactBlobKey(record);
			const metadata = getDocsArtifactMetadata(record);
			const text = createStoredText(record.payload);

			await storage.put(key, text, {
				contentType: STORED_CONTENT_TYPE,
				metadata,
			});
			await writeBlobCache(cache, key, { metadata, text });
		},
		async putGitHubContent(record) {
			const key = getGitHubContentBlobKey(record);
			const metadata = getGithubContentMetadata(record);
			const text = createStoredText(
				record.isPresent
					? record.contentKind === 'file'
						? record.textContent
						: record.jsonContent
					: null,
			);

			await storage.put(key, text, {
				contentType: STORED_CONTENT_TYPE,
				metadata,
			});
			await writeBlobCache(cache, key, { metadata, text });
		},
	};
}

async function markBlobObjectsStale(opts: {
	cache: BlobStorageCache | undefined;
	matches: (metadata: Record<string, string> | undefined) => boolean;
	prefixes: Array<string>;
	storage: BlobStorage;
}) {
	const seenKeys = new Set<string>();
	let count = 0;

	for (const prefix of opts.prefixes) {
		const objects = await listBlobObjects(opts.storage, prefix);

		for (const object of objects) {
			if (seenKeys.has(object.key)) {
				continue;
			}

			seenKeys.add(object.key);

			const stored = await readBlob(opts.storage, undefined, object.key);

			if (!stored || !opts.matches(stored.metadata)) {
				continue;
			}

			const metadata = {
				...stored.metadata,
				staleAt: EPOCH_ISO,
			};

			await opts.storage.put(object.key, stored.text, {
				contentType: STORED_CONTENT_TYPE,
				metadata,
			});
			await writeBlobCache(opts.cache, object.key, {
				metadata,
				text: stored.text,
			});
			count += 1;
		}
	}

	return count;
}

async function getCacheBackend() {
	const storage = await getBlobStorage(GITHUB_CONTENT_BLOB_STORAGE);

	if (storage) {
		if (!blobBackend) {
			blobBackend = createBlobBackend(storage, getBlobStorageCache(GITHUB_CONTENT_BLOB_STORAGE));
		}

		return blobBackend;
	}

	return memoryBackend;
}

const memoryBackend = createMemoryBackend();

async function upsertGithubContent(opts: {
	contentKind: ContentKind;
	gitRef: string;
	path: string;
	repo: string;
	value: unknown;
}) {
	const now = new Date();
	const isPresent = opts.value !== null;
	const freshness = createFreshnessWindow(isPresent);
	const backend = await getCacheBackend();

	await backend.putGitHubContent({
		repo: opts.repo,
		gitRef: opts.gitRef,
		contentKind: opts.contentKind,
		path: opts.path,
		isPresent,
		textContent:
			opts.contentKind === 'file' && isPresent ? getRequiredFileContent(opts.value) : undefined,
		jsonContent: opts.contentKind === 'dir' && isPresent ? opts.value : undefined,
		staleAt: freshness.staleAt,
		updatedAt: now,
	});
}

async function getCachedGitHubContent<T>(opts: {
	cacheKey: string;
	contentKind: ContentKind;
	gitRef: string;
	origin: () => Promise<T | null>;
	path: string;
	readStoredValue: (row: GithubContentRecord | undefined) => CachedValue<T>;
	repo: string;
}) {
	assertValidGithubContentKey(opts);

	const backend = await getCacheBackend();
	const readRow = () =>
		backend.getGitHubContent({
			repo: opts.repo,
			gitRef: opts.gitRef,
			contentKind: opts.contentKind,
			path: opts.path,
		});
	const persist = (value: T | null) =>
		upsertGithubContent({
			repo: opts.repo,
			gitRef: opts.gitRef,
			contentKind: opts.contentKind,
			path: opts.path,
			value,
		});

	const cachedRow = await readRow();
	const storedValue = opts.readStoredValue(cachedRow);
	const forciblyStale = !!cachedRow && isForciblyStale(cachedRow.staleAt);

	if (canUseStoredGithubContentValue(opts.contentKind, storedValue) && !forciblyStale) {
		if (cachedRow && isFresh(cachedRow.staleAt)) {
			return storedValue;
		}
	}

	return withPendingRefresh(opts.cacheKey, async () => {
		const latestRow = await readRow();
		const latestValue = opts.readStoredValue(latestRow);
		const latestForciblyStale = !!latestRow && isForciblyStale(latestRow.staleAt);

		if (
			canUseStoredGithubContentValue(opts.contentKind, latestValue) &&
			latestRow &&
			!latestForciblyStale &&
			isFresh(latestRow.staleAt)
		) {
			return latestValue;
		}

		try {
			const value = await opts.origin();
			await persist(value);
			return value;
		} catch (error) {
			if (latestValue !== undefined && latestValue !== null) {
				console.warn(`[GitHub Cache] Serving stale value ${opts.cacheKey}`);
				return latestValue;
			}

			throw error;
		}
	});
}

async function upsertDocsArtifact(opts: {
	artifactKey: string;
	artifactType: string;
	docsRoot: string;
	gitRef: string;
	payload: unknown;
	repo: string;
}) {
	const now = new Date();
	const freshness = createFreshnessWindow(true);
	const backend = await getCacheBackend();

	await backend.putDocsArtifact({
		repo: opts.repo,
		gitRef: opts.gitRef,
		docsRoot: opts.docsRoot,
		artifactType: opts.artifactType,
		artifactKey: opts.artifactKey,
		payload: opts.payload,
		staleAt: freshness.staleAt,
		updatedAt: now,
	});
}

export async function getCachedGitHubTextFile(opts: {
	gitRef: string;
	origin: () => Promise<string | null>;
	path: string;
	repo: string;
}) {
	return getCachedGitHubContent({
		...opts,
		cacheKey: getGitHubContentBlobKey({
			...opts,
			contentKind: 'file',
		}),
		contentKind: 'file',
		readStoredValue: readStoredTextValue,
	});
}

export async function getCachedGitHubJsonContent<T>(opts: {
	gitRef: string;
	isValue: (value: unknown) => value is T;
	origin: () => Promise<T | null>;
	path: string;
	repo: string;
}) {
	return getCachedGitHubContent({
		...opts,
		cacheKey: getGitHubContentBlobKey({
			...opts,
			contentKind: 'dir',
		}),
		contentKind: 'dir',
		readStoredValue: (row) => readStoredJsonValue(row, opts.isValue),
	});
}

export async function getCachedDocsArtifact<T>(opts: {
	artifactKey: string;
	artifactType: string;
	build: () => Promise<T>;
	docsRoot: string;
	gitRef: string;
	isValue: (value: unknown) => value is T;
	repo: string;
}) {
	assertValidDocsArtifactKey(opts);

	const backend = await getCacheBackend();
	const cacheKey = getDocsArtifactBlobKey(opts);

	const readRow = () =>
		backend.getDocsArtifact({
			repo: opts.repo,
			gitRef: opts.gitRef,
			docsRoot: opts.docsRoot,
			artifactType: opts.artifactType,
			artifactKey: opts.artifactKey,
		});

	const cachedRow = await readRow();
	const storedValue = cachedRow && opts.isValue(cachedRow.payload) ? cachedRow.payload : undefined;
	const forciblyStale = !!cachedRow && isForciblyStale(cachedRow.staleAt);

	const refreshArtifact = () =>
		withPendingRefresh(cacheKey, async () => {
			const latestRow = await readRow();
			const latestValue =
				latestRow && opts.isValue(latestRow.payload) ? latestRow.payload : undefined;
			const latestForciblyStale = !!latestRow && isForciblyStale(latestRow.staleAt);

			if (
				latestValue !== undefined &&
				latestRow &&
				!latestForciblyStale &&
				isFresh(latestRow.staleAt)
			) {
				return latestValue;
			}

			try {
				const payload = await opts.build();
				await upsertDocsArtifact({ ...opts, payload });
				return payload;
			} catch (error) {
				if (latestValue !== undefined) {
					console.warn(`[GitHub Cache] Serving stale artifact ${cacheKey}`);
					return latestValue;
				}

				throw error;
			}
		});

	if (storedValue !== undefined) {
		if (!forciblyStale && cachedRow && isFresh(cachedRow.staleAt)) {
			return storedValue;
		}

		if (
			scheduleHostRuntimeTask(() =>
				refreshArtifact().then(
					() => undefined,
					(error) => {
						console.warn(`[GitHub Cache] Background artifact refresh failed ${cacheKey}`, error);
					},
				),
			)
		) {
			console.warn(`[GitHub Cache] Serving stale artifact ${cacheKey}; refreshing in background`);
			return storedValue;
		}
	}

	return refreshArtifact();
}

export async function listDocsCacheRepoStats() {
	const backend = await getCacheBackend();
	return backend.listRepoStats();
}

export async function pruneStaleCacheRows(
	opts: {
		maxAgeMs?: number;
		negativeMaxAgeMs?: number;
	} = {},
) {
	const backend = await getCacheBackend();
	return backend.pruneStaleCacheRows(opts);
}

export async function markGitHubContentStale(
	opts: {
		gitRef?: string;
		repo?: string;
	} = {},
) {
	if (opts.repo) {
		assertValidRepo(opts.repo);
	}

	if (opts.gitRef) {
		assertValidGitRef(opts.gitRef);
	}

	const backend = await getCacheBackend();
	return backend.markGitHubContentStale(opts);
}

export async function markDocsArtifactsStale(
	opts: {
		gitRef?: string;
		repo?: string;
	} = {},
) {
	if (opts.repo) {
		assertValidRepo(opts.repo);
	}

	if (opts.gitRef) {
		assertValidGitRef(opts.gitRef);
	}

	const backend = await getCacheBackend();
	return backend.markDocsArtifactsStale(opts);
}

export function resetGitHubContentCacheForTest() {
	pendingRefreshes.clear();
	memoryGitHubContent.clear();
	memoryDocsArtifacts.clear();
	blobBackend = undefined;
}
