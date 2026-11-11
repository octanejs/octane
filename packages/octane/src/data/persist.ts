/**
 * A persistent cache for a data store. The store saves each read's confirmed
 * value, and a view's confirmed rows, through a storage adapter, and on its
 * next start shows them with their age, like a server render's seed: a fresh
 * value needs no request and a stale one shows while it reloads. Nothing
 * pending is saved, so a restart never replays an edit the server refused.
 *
 * Invariants:
 * - Every value is encrypted with a key from the session, and every name the
 *   storage sees (partition, key, version) is a keyed hash. People who share a
 *   browser can neither read nor list each other's values, and `retire()`
 *   clears the account's own.
 * - A value saved under another shape of its read's output schema, where the
 *   validator describes one, or another `version`, is discarded unread. One
 *   that fails validation when restored is discarded too.
 * - A saved value that a later write or `invalidate()` marked stale, in this
 *   session or another, is restored stale, though it was never loaded then:
 *   each tag and entity name keeps the time it was last marked, and each
 *   value the time it was saved and the names it holds.
 * - Saves are coalesced into one storage transaction per host task.
 * - The partition stays within its budget: after each save, expired values go
 *   first, then the least recently used, down to 90% of the budget. Values a
 *   mounted component is showing are never purged.
 */
import * as devalue from 'devalue';
import { postHostTask } from '../host-task.js';
import type { Read } from './contracts.js';

/** What the store keeps in memory about each saved value. */
export interface StoredMeta {
	readonly key: string;
	/** The length of the saved text, which stands in for its size. */
	readonly size: number;
	/** Wall-clock time the server's value was loaded, so its age survives a restart. */
	readonly savedAt: number;
	/** Wall-clock time after which the value is never shown; null when it never expires. */
	readonly expiresAt: number | null;
	readonly lastUsed: number;
	/** A hash of the read's `version` and output schema shape when it was saved. */
	readonly version: string;
}

/**
 * Where saved values live. Implement it to persist anywhere: IndexedDB, OPFS
 * or native storage. It only ever receives hashed names and encrypted values.
 */
export interface PersistentStorage {
	/** Every saved value's metadata in the partition. */
	index(partition: string): Promise<StoredMeta[]>;
	get(partition: string, key: string): Promise<string | undefined>;
	/**
	 * In one transaction, save each item's metadata, and its value when given,
	 * then delete `remove`.
	 */
	commit(
		partition: string,
		put: ReadonlyArray<{ readonly meta: StoredMeta; readonly value?: string }>,
		remove: readonly string[],
	): Promise<void>;
	clear(partition: string): Promise<void>;
}

/** What `budget` may base a size on. Browsers that hide a signal leave it undefined. */
export interface DeviceHints {
	/** Approximate device memory in gigabytes (`navigator.deviceMemory`). */
	readonly memory: number | undefined;
	/** Whether the user asked to reduce data use (`navigator.connection.saveData`). */
	readonly saveData: boolean;
	/** The origin's storage quota in bytes (`navigator.storage.estimate()`). */
	readonly quota: number | undefined;
}

/** Key material: a random secret of at least 128 bits, never a password. */
export type CacheKey = string | BufferSource;

export interface PersistOptions {
	readonly storage: PersistentStorage;
	/** The account the store acts for; each account's values are kept apart. */
	readonly partition: string;
	/**
	 * Encrypts every saved value. Take it from the signed-in session, such as a
	 * per-user secret the server issues with it, so that only that user's
	 * session can read what it saved.
	 */
	readonly key: CacheKey | (() => CacheKey | Promise<CacheKey>);
	/** The most the partition may hold, in characters of saved text; `'auto'` sizes it by device. */
	readonly budget?: number | 'auto' | ((device: DeviceHints) => number);
}

const MB = 1024 * 1024;

/**
 * 1 MB on devices with 2 GB of memory or less, 2 MB up to 4 GB, 5 MB above,
 * 2 MB where memory is hidden. Halved when the user saves data, and never more
 * than 1% of the quota.
 */
export function autoBudget(device: DeviceHints): number {
	const { memory, saveData, quota } = device;
	let budget = memory === undefined ? 2 * MB : memory <= 2 ? MB : memory <= 4 ? 2 * MB : 5 * MB;
	if (saveData) budget /= 2;
	return quota === undefined ? budget : Math.min(budget, quota / 100);
}

async function deviceHints(): Promise<DeviceHints> {
	const navigator = (globalThis as { navigator?: any }).navigator;
	let quota: number | undefined;
	try {
		quota = (await navigator?.storage?.estimate?.())?.quota;
	} catch {}
	return {
		memory: navigator?.deviceMemory,
		saveData: navigator?.connection?.saveData === true,
		quota,
	};
}

/** A saved value: the read's confirmed value and, for a view, the part of its order it held. */
export interface Stored {
	readonly value: unknown;
	readonly savedAt: number;
	readonly stale: boolean;
	readonly span: unknown;
	/** The read's tags and the entity names its value holds, which writes mark stale. */
	readonly tags: readonly string[];
}

/** A value to save, and the read it belongs to. */
export type Saving = { readonly stored: Stored; readonly read: Read<any, any> };

export interface Persistence {
	/** The saved value for `key`, unless it was saved for another shape of `read`. */
	restore(key: string, read: Read<any, any>): Promise<Stored | undefined>;
	/** Save `key` in the next host task; `collect` reads its value then, and `null` deletes it. */
	mark(key: string): void;
	/** Drop a saved value that failed validation or expired. */
	discard(key: string): void;
	/** Values saved before now that hold one of these tags are restored stale. */
	invalidated(tags: readonly string[]): void;
	/** Clear the partition and stop saving. */
	clear(): void;
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** AES-GCM for values and HMAC for names, both derived from the session's key with HKDF. */
async function createCipher(source: PersistOptions['key']) {
	const secret = typeof source === 'function' ? await source() : source;
	const material = typeof secret === 'string' ? encoder.encode(secret) : secret;
	const base = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveKey']);
	const derive = (
		info: string,
		algorithm: AesKeyGenParams | HmacKeyGenParams,
		usages: KeyUsage[],
	) =>
		crypto.subtle.deriveKey(
			{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: encoder.encode(info) },
			base,
			algorithm,
			false,
			usages,
		);
	const [sealing, naming] = await Promise.all([
		derive('octane/data values', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
		derive('octane/data names', { name: 'HMAC', hash: 'SHA-256' }, ['sign']),
	]);
	return {
		async name(text: string): Promise<string> {
			return toBase64(
				new Uint8Array(await crypto.subtle.sign('HMAC', naming, encoder.encode(text))),
			);
		},
		/** Encrypt `text`, bound to `name`, so a value moved to another key fails to open. */
		async seal(text: string, name: string): Promise<string> {
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const sealed = await crypto.subtle.encrypt(
				{ name: 'AES-GCM', iv, additionalData: encoder.encode(name) },
				sealing,
				encoder.encode(text),
			);
			const bytes = new Uint8Array(12 + sealed.byteLength);
			bytes.set(iv);
			bytes.set(new Uint8Array(sealed), 12);
			return toBase64(bytes);
		},
		async open(text: string, name: string): Promise<string> {
			const bytes = fromBase64(text);
			const plain = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(name) },
				sealing,
				bytes.subarray(12),
			);
			return new TextDecoder().decode(plain);
		},
	};
}

/** The output schema's shape, where its validator describes one. */
function shape(read: Read<any, any>): string {
	try {
		return (
			JSON.stringify(read.output['~standard'].jsonSchema?.output({ target: 'draft-2020-12' })) ?? ''
		);
	} catch {
		return '';
	}
}

export function createPersistence(
	options: PersistOptions,
	/** The value to save for `key`: null deletes it, undefined leaves the saved one. */
	collect: (key: string) => Saving | null | undefined,
	inUse: (key: string) => boolean,
): Persistence {
	const { storage } = options;
	let cipher!: Awaited<ReturnType<typeof createCipher>>;
	let partition = '';
	/** When each tag was last marked stale, kept in its own partition. */
	let marksPartition = '';
	const marks = new Map<string, number>();
	let marksChanged = false;
	/** Saved values' metadata, by hashed name. */
	let metas = new Map<string, StoredMeta>();
	/** Hashed names of keys seen this session, and the reverse. */
	const names = new Map<string, Promise<string>>();
	const owners = new Map<string, string>();
	const versions = new WeakMap<Read<any, any>, Promise<string>>();
	let budget = Infinity;
	let cleared = false;
	const dirty = new Set<string>();
	const touched = new Set<string>();
	const removed = new Set<string>();
	let scheduled = false;
	let writing: Promise<void> = Promise.resolve();

	const ready = (async () => {
		cipher = await createCipher(options.key);
		partition = await cipher.name(`partition\n${options.partition}`);
		const [index, hints] = await Promise.all([storage.index(partition), deviceHints()]);
		const { budget: setting = 'auto' } = options;
		budget =
			typeof setting === 'number' ? setting : (setting === 'auto' ? autoBudget : setting)(hints);
		// Keys saved while the index loaded are newer than what it lists.
		for (const meta of index) if (!metas.has(meta.key)) metas.set(meta.key, meta);
		marksPartition = await cipher.name(`marks\n${options.partition}`);
		const saved = await storage.get(marksPartition, marksPartition);
		if (saved !== undefined) {
			for (const [tag, at] of devalue.parse(await cipher.open(saved, marksPartition))) {
				// Marks made while the index loaded are newer.
				if (!marks.has(tag)) marks.set(tag, at);
			}
		}
		// Only what has expired: which values are in use is known once components ask for them.
		purge(Date.now(), Infinity);
		if (removed.size > 0) schedule();
	})().catch(() => {
		// Storage that cannot be read, such as a private window's, or no key leaves the store in memory only.
		cleared = true;
	});

	function nameOf(key: string): Promise<string> {
		let name = names.get(key);
		if (!name) {
			name = cipher.name(`key\n${key}`).then((hashed) => {
				owners.set(hashed, key);
				return hashed;
			});
			names.set(key, name);
		}
		return name;
	}

	function versionOf(read: Read<any, any>): Promise<string> {
		let version = versions.get(read);
		if (!version)
			versions.set(read, (version = cipher.name(`version\n${read.version}\n${shape(read)}`)));
		return version;
	}

	function schedule(): void {
		if (scheduled || cleared) return;
		scheduled = true;
		postHostTask(() => {
			scheduled = false;
			writing = writing.then(flush, flush);
		});
	}

	/** Delete expired values, then the least recently used, until the partition fits. */
	function purge(now: number, limit = budget): void {
		let total = 0;
		for (const meta of metas.values()) total += meta.size;
		if (total <= limit && ![...metas.values()].some((meta) => expired(meta, now))) return;
		const order = [...metas.values()]
			.filter((meta) => !inUse(owners.get(meta.key) ?? ''))
			.sort((a, b) => Number(expired(b, now)) - Number(expired(a, now)) || a.lastUsed - b.lastUsed);
		for (const meta of order) {
			if (!expired(meta, now) && total <= limit * 0.9) break;
			total -= meta.size;
			metas.delete(meta.key);
			removed.add(meta.key);
		}
	}

	async function flush(): Promise<void> {
		await ready;
		if (cleared) return;
		const now = Date.now();
		const keys = [...dirty];
		dirty.clear();
		const put: Array<{ meta: StoredMeta; value?: string }> = [];
		for (const key of keys) {
			const saving = collect(key);
			if (saving === undefined) continue;
			const name = await nameOf(key);
			if (saving === null) {
				if (metas.delete(name)) removed.add(name);
				continue;
			}
			const { stored, read } = saving;
			// `at` is when the value was last known current, which marks are compared with.
			const value = await cipher.seal(devalue.stringify({ ...stored, at: now }), name);
			const meta: StoredMeta = {
				key: name,
				size: value.length,
				savedAt: stored.savedAt,
				expiresAt: read.expire === Infinity ? null : stored.savedAt + read.expire,
				lastUsed: now,
				version: await versionOf(read),
			};
			metas.set(name, meta);
			removed.delete(name);
			put.push({ meta, value });
		}
		for (const name of touched) {
			const meta = metas.get(name);
			if (meta) put.push({ meta: { ...meta, lastUsed: now } });
		}
		touched.clear();
		purge(now);
		const remove = [...removed];
		removed.clear();
		const kept = put.filter(({ meta }) => metas.has(meta.key));
		if (!cleared && (kept.length > 0 || remove.length > 0)) {
			await storage.commit(partition, kept, remove).catch(() => {});
		}
		if (!cleared && marksChanged) {
			marksChanged = false;
			const value = await cipher.seal(devalue.stringify([...marks]), marksPartition);
			const meta = {
				key: marksPartition,
				size: value.length,
				savedAt: now,
				expiresAt: null,
				lastUsed: now,
				version: '',
			};
			await storage.commit(marksPartition, [{ meta, value }], []).catch(() => {
				// Marks keep restored values honest, so a failed save is tried again at the next one.
				marksChanged = true;
			});
		}
	}

	function forget(name: string): void {
		if (metas.delete(name)) removed.add(name);
		schedule();
	}

	// A hidden page may never run another task: save what is waiting now.
	const document = (globalThis as { document?: Document }).document;
	const hidden = () => {
		if (document!.visibilityState === 'hidden' && !cleared) writing = writing.then(flush, flush);
	};
	document?.addEventListener('visibilitychange', hidden);

	return {
		async restore(key, read) {
			await ready;
			if (cleared) return undefined;
			const name = await nameOf(key);
			const meta = metas.get(name);
			if (!meta) return undefined;
			if (meta.version !== (await versionOf(read)) || expired(meta, Date.now())) {
				forget(name);
				return undefined;
			}
			const text = await storage.get(partition, name).catch(() => undefined);
			if (cleared || text === undefined) return undefined;
			try {
				const stored = devalue.parse(await cipher.open(text, name)) as Stored & { at: number };
				// Purging reads this order, so it must see the use now, not after the next save.
				metas.set(name, { ...meta, lastUsed: Date.now() });
				touched.add(name);
				schedule();
				const marked = stored.tags.some((tag) => (marks.get(tag) ?? 0) > stored.at);
				return marked ? { ...stored, stale: true } : stored;
			} catch {
				forget(name);
				return undefined;
			}
		},
		mark(key) {
			dirty.add(key);
			schedule();
		},
		discard(key) {
			void ready.then(async () => {
				if (!cleared) forget(await nameOf(key));
			});
		},
		invalidated(tags) {
			const now = Date.now();
			for (const tag of tags) marks.set(tag, now);
			marksChanged = true;
			schedule();
		},
		clear() {
			cleared = true;
			document?.removeEventListener('visibilitychange', hidden);
			metas = new Map();
			marks.clear();
			dirty.clear();
			touched.clear();
			removed.clear();
			// After any save already under way, so the clear is the last write.
			writing = writing
				.then(() => ready)
				.then(async () => {
					if (partition) {
						await Promise.all([storage.clear(partition), storage.clear(marksPartition)]);
					}
				})
				.catch(() => {});
		},
	};
}

const expired = (meta: StoredMeta, now: number) => meta.expiresAt !== null && meta.expiresAt <= now;

/** A storage adapter in memory, for tests and for hosts without persistent storage. */
export function memoryStorage(): PersistentStorage {
	const partitions = new Map<string, Map<string, { meta: StoredMeta; value: string }>>();
	const of = (partition: string) => {
		let items = partitions.get(partition);
		if (!items) partitions.set(partition, (items = new Map()));
		return items;
	};
	return {
		index: async (partition) => [...of(partition).values()].map(({ meta }) => meta),
		get: async (partition, key) => of(partition).get(key)?.value,
		async commit(partition, put, remove) {
			const items = of(partition);
			for (const { meta, value } of put) {
				const previous = items.get(meta.key);
				if (value !== undefined) items.set(meta.key, { meta, value });
				else if (previous) items.set(meta.key, { meta, value: previous.value });
			}
			for (const key of remove) items.delete(key);
		},
		async clear(partition) {
			partitions.delete(partition);
		},
	};
}

const request = <T>(target: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		target.onsuccess = () => resolve(target.result);
		target.onerror = () => reject(target.error);
	});

const done = (transaction: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = transaction.onabort = () => reject(transaction.error);
	});

/**
 * A storage adapter over IndexedDB: one database, with metadata and values in
 * separate stores so the index loads without reading any value.
 */
export function indexedDBStorage(options: { name?: string } = {}): PersistentStorage {
	let database: Promise<IDBDatabase> | undefined;
	const open = () =>
		(database ??= (() => {
			const opening = indexedDB.open(options.name ?? 'octane-data', 1);
			opening.onupgradeneeded = () => {
				opening.result.createObjectStore('meta');
				opening.result.createObjectStore('value');
			};
			return request(opening);
		})());
	// Array keys sort after strings, so `[partition, []]` bounds every `[partition, key]`.
	const range = (partition: string) => IDBKeyRange.bound([partition], [partition, []]);
	return {
		async index(partition) {
			const db = await open();
			return request(db.transaction('meta').objectStore('meta').getAll(range(partition)));
		},
		async get(partition, key) {
			const db = await open();
			return request(db.transaction('value').objectStore('value').get([partition, key]));
		},
		async commit(partition, put, remove) {
			const db = await open();
			const transaction = db.transaction(['meta', 'value'], 'readwrite');
			const meta = transaction.objectStore('meta');
			const value = transaction.objectStore('value');
			for (const item of put) {
				meta.put(item.meta, [partition, item.meta.key]);
				if (item.value !== undefined) value.put(item.value, [partition, item.meta.key]);
			}
			for (const key of remove) {
				meta.delete([partition, key]);
				value.delete([partition, key]);
			}
			return done(transaction);
		},
		async clear(partition) {
			const db = await open();
			const transaction = db.transaction(['meta', 'value'], 'readwrite');
			transaction.objectStore('meta').delete(range(partition));
			transaction.objectStore('value').delete(range(partition));
			return done(transaction);
		},
	};
}
