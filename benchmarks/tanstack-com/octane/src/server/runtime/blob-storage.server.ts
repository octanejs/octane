import { getHostRuntimeEnv, isIsolateRuntime } from './host.server';

export type BlobStorageName = 'githubContentCache' | 'npmDownloadCache';

export type BlobStorageObject = {
	key: string;
	metadata?: Record<string, string>;
	text: () => Promise<string>;
	uploaded?: Date;
};

export type BlobStorageListedObject = {
	key: string;
	metadata?: Record<string, string>;
	uploaded?: Date;
};

export type BlobStorageListOptions = {
	cursor?: string;
	limit?: number;
	prefix?: string;
};

export type BlobStorageListResult = {
	cursor?: string;
	objects: Array<BlobStorageListedObject>;
	truncated: boolean;
};

export type BlobStorage = {
	delete: (keys: string | Array<string>) => Promise<void>;
	get: (key: string) => Promise<BlobStorageObject | null>;
	list: (options?: BlobStorageListOptions) => Promise<BlobStorageListResult>;
	put: (
		key: string,
		value: string,
		options?: {
			contentType?: string;
			metadata?: Record<string, string>;
		},
	) => Promise<void>;
};

export type BlobStorageCacheEntry = {
	metadata: Record<string, string>;
	text: string;
};

export type BlobStorageCache = {
	delete: (key: string) => Promise<void>;
	get: (key: string) => Promise<BlobStorageCacheEntry | undefined>;
	put: (key: string, entry: BlobStorageCacheEntry) => Promise<void>;
};

type RuntimeBlobObject = {
	customMetadata?: Record<string, string>;
	key: string;
	uploaded?: Date;
};

type RuntimeBlobObjectBody = RuntimeBlobObject & {
	text: () => Promise<string>;
};

type RuntimeBlobListOptions = {
	cursor?: string;
	include?: Array<'customMetadata'>;
	limit?: number;
	prefix?: string;
};

type RuntimeBlobListResult = {
	cursor?: string;
	objects: Array<RuntimeBlobObject>;
	truncated: boolean;
};

type RuntimeBlobBucket = {
	delete: (keys: string | Array<string>) => Promise<unknown>;
	get: (key: string) => Promise<RuntimeBlobObjectBody | null>;
	list: (options?: RuntimeBlobListOptions) => Promise<RuntimeBlobListResult>;
	put: (
		key: string,
		value: string,
		options?: {
			customMetadata?: Record<string, string>;
			httpMetadata?: {
				contentType?: string;
			};
		},
	) => Promise<unknown>;
};

const CACHE_METADATA_HEADER = 'x-blob-storage-metadata';
const CACHE_ORIGIN = 'https://blob-storage-cache.tanstack.internal';

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isRuntimeBlobBucket(value: unknown): value is RuntimeBlobBucket {
	return (
		isObject(value) &&
		'delete' in value &&
		typeof value.delete === 'function' &&
		'get' in value &&
		typeof value.get === 'function' &&
		'list' in value &&
		typeof value.list === 'function' &&
		'put' in value &&
		typeof value.put === 'function'
	);
}

function isCacheLike(value: unknown): value is Cache {
	return (
		isObject(value) &&
		'delete' in value &&
		typeof value.delete === 'function' &&
		'match' in value &&
		typeof value.match === 'function' &&
		'put' in value &&
		typeof value.put === 'function'
	);
}

function readMetadataHeader(value: string | null) {
	if (!value) {
		return undefined;
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(value);
	} catch {
		return undefined;
	}

	if (!isObject(parsed)) {
		return undefined;
	}

	const metadata: Record<string, string> = {};

	for (const [key, metadataValue] of Object.entries(parsed)) {
		if (typeof metadataValue !== 'string') {
			return undefined;
		}

		metadata[key] = metadataValue;
	}

	return metadata;
}

function getRuntimeBindingName(name: BlobStorageName) {
	switch (name) {
		case 'githubContentCache':
			return 'GITHUB_CONTENT_CACHE';
		case 'npmDownloadCache':
			return 'NPM_DOWNLOAD_CACHE';
	}
}

function getCacheRequest(name: BlobStorageName, key: string) {
	const url = new URL(CACHE_ORIGIN);
	url.pathname = `/${name}/${encodeURIComponent(key)}`;
	return new Request(url);
}

function getDefaultRuntimeCache() {
	if (!isIsolateRuntime() || typeof caches === 'undefined') {
		return undefined;
	}

	if (!('default' in caches)) {
		return undefined;
	}

	const cache = caches.default;
	return isCacheLike(cache) ? cache : undefined;
}

function createBlobStorage(bucket: RuntimeBlobBucket): BlobStorage {
	return {
		async delete(keys) {
			await bucket.delete(keys);
		},
		async get(key) {
			const object = await bucket.get(key);

			if (!object) {
				return null;
			}

			return {
				key: object.key,
				metadata: object.customMetadata,
				text: () => object.text(),
				uploaded: object.uploaded,
			};
		},
		async list(options) {
			const result = await bucket.list({
				cursor: options?.cursor,
				include: ['customMetadata'],
				limit: options?.limit,
				prefix: options?.prefix,
			});

			return {
				cursor: result.cursor,
				objects: result.objects.map((object) => ({
					key: object.key,
					metadata: object.customMetadata,
					uploaded: object.uploaded,
				})),
				truncated: result.truncated,
			};
		},
		async put(key, value, options) {
			await bucket.put(key, value, {
				customMetadata: options?.metadata,
				httpMetadata: {
					contentType: options?.contentType,
				},
			});
		},
	};
}

export async function getBlobStorage(name: BlobStorageName) {
	const hostEnv = await getHostRuntimeEnv();
	const binding = hostEnv?.[getRuntimeBindingName(name)];

	return isRuntimeBlobBucket(binding) ? createBlobStorage(binding) : undefined;
}

export function getBlobStorageCache(name: BlobStorageName): BlobStorageCache | undefined {
	const cache = getDefaultRuntimeCache();

	if (!cache) {
		return undefined;
	}

	return {
		async delete(key) {
			await cache.delete(getCacheRequest(name, key));
		},
		async get(key) {
			const response = await cache.match(getCacheRequest(name, key));

			if (!response) {
				return undefined;
			}

			const metadata = readMetadataHeader(response.headers.get(CACHE_METADATA_HEADER));

			if (!metadata) {
				return undefined;
			}

			return {
				metadata,
				text: await response.text(),
			};
		},
		async put(key, entry) {
			await cache.put(
				getCacheRequest(name, key),
				new Response(entry.text, {
					headers: {
						'Cache-Control': 'public, max-age=31536000',
						[CACHE_METADATA_HEADER]: JSON.stringify(entry.metadata),
						'Content-Type': 'application/json; charset=utf-8',
					},
				}),
			);
		},
	};
}
