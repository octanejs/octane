import type { AdoptionFrame, ScopeSeed, SignalSeedEntry } from './types.js';
import type { NativeReadWitness } from './native-read-collector.js';
import type { NativeAdoptionOwner, NativeReadSource } from './read-protocol.js';
import { decodeSignalValue, snapshotSignalValue } from '../data-encoding.js';

export const NATIVE_SIGNAL_SEED_ATTR = 'data-octane-native-signals';
/** A server arm with untransportable demand is mounted fresh within its own range. */
export const NATIVE_SIGNAL_FRESH_COMMENT = 'oct-native-fresh:';

export interface NativeSignalReference {
	readonly key: string;
	/** Strict value reads are explicit here, unlike their omission in a ScopeSeed. */
	readonly read: 'value' | 'latest' | 'snapshot';
}

/** Version 2 references only the initial document entries used by this HTML. */
export type NativeSignalManifest =
	| { readonly version: 1; readonly scopes: readonly ScopeSeed[] }
	| {
			readonly version: 2;
			readonly scopes: readonly ScopeSeed[];
			readonly initialDocument: {
				readonly scopeKey: string;
				readonly entries: readonly NativeSignalReference[];
			};
	  };

function seedEntryKey(entry: { readonly key: string; readonly read?: string }): string {
	return (entry.read ?? 'value') + ':' + entry.key;
}

function seedEntrySignature(entry: SignalSeedEntry): string {
	return JSON.stringify(snapshotSignalValue({ ...entry, read: entry.read ?? 'value' }));
}

interface InitialDocumentCapture {
	readonly seed: ScopeSeed;
	readonly entries: ReadonlyMap<string, SignalSeedEntry>;
	readonly signatures: ReadonlyMap<string, string>;
}

// Only immutable wire snapshots are recognized here; no live owner is retained.
const capturedInitialDocumentSignals = /* @__PURE__ */ new WeakMap<
	ScopeSeed,
	InitialDocumentCapture
>();

/** Take ownership of wire data without reading getters or retaining mutable input. */
export function captureInitialDocumentSignals(seed: ScopeSeed, scopeKey: string): ScopeSeed {
	return getInitialDocumentCapture(seed, scopeKey).seed;
}

function getInitialDocumentCapture(seed: ScopeSeed, scopeKey?: string): InitialDocumentCapture {
	const previous = capturedInitialDocumentSignals.get(seed);
	if (previous !== undefined) {
		if (scopeKey !== undefined && previous.seed.scopeKey !== scopeKey)
			throw new Error('Initial document signals require a matching version 1 scope seed.');
		return previous;
	}
	const captured = snapshotSignalValue(seed) as ScopeSeed;
	if (
		captured === null ||
		typeof captured !== 'object' ||
		captured.version !== 1 ||
		typeof captured.scopeKey !== 'string' ||
		!captured.scopeKey.trim() ||
		(scopeKey !== undefined && captured.scopeKey !== scopeKey) ||
		!Array.isArray(captured.entries)
	)
		throw new Error('Initial document signals require a matching version 1 scope seed.');
	const entries = new Map<string, SignalSeedEntry>();
	const signatures = new Map<string, string>();
	for (const entry of captured.entries) {
		const read = entry?.read ?? 'value';
		if (
			entry === null ||
			typeof entry !== 'object' ||
			typeof entry.key !== 'string' ||
			!entry.key.trim() ||
			!['signal', 'derived', 'async'].includes(entry.kind) ||
			!['value', 'latest', 'snapshot'].includes(read) ||
			typeof entry.complete !== 'boolean' ||
			!Array.isArray(entry.value) ||
			(entry.available !== undefined &&
				(read !== 'latest' || typeof entry.available !== 'boolean')) ||
			(entry.refreshing !== undefined && typeof entry.refreshing !== 'boolean') ||
			(entry.connection !== undefined &&
				!['none', 'connecting', 'open', 'closed'].includes(entry.connection)) ||
			entries.has(seedEntryKey(entry))
		)
			throw new Error('Initial document signals require unique, valid node entries.');
		if (entry.available === false) {
			if (
				entry.complete ||
				entry.request !== undefined ||
				entry.value.length !== 1 ||
				entry.value[0] !== 'undefined'
			)
				throw new Error('Unavailable initial document entries cannot contain ready data.');
		} else if (entry.kind === 'async') {
			const request = entry.request;
			if (
				request === null ||
				typeof request !== 'object' ||
				typeof request.queryKey !== 'string' ||
				!request.queryKey.trim() ||
				!['promise', 'stream'].includes(request.kind) ||
				!Array.isArray(request.argument)
			)
				throw new Error('Initial document async entries require a query identity.');
			decodeSignalValue(request.argument);
		} else if (entry.request !== undefined) {
			throw new Error('Only initial document async entries may contain a query identity.');
		}
		decodeSignalValue(entry.value);
		const key = seedEntryKey(entry);
		entries.set(key, entry);
		signatures.set(key, seedEntrySignature(entry));
	}
	const result = { seed: captured, entries, signatures };
	capturedInitialDocumentSignals.set(captured, result);
	return result;
}

export interface NativeSeedReads {
	readonly reads: Map<NativeReadSource, number>;
	mixed: boolean;
}

export function mergeNativeSeedReads(
	previous: NativeSeedReads | null,
	next: NativeReadWitness,
): NativeSeedReads {
	const target = previous ?? { reads: new Map(), mixed: false };
	if (next.mixed) target.mixed = true;
	for (const [source, version] of next.reads) {
		const prior = target.reads.get(source);
		if (prior === undefined) target.reads.set(source, version);
		else if (prior !== version) target.mixed = true;
	}
	return target;
}

/** Read maps append and never replace their first revision, so a suffix can rewind. */
export function rewindNativeSeedReads(
	reads: NativeSeedReads | null,
	size: number,
	mixed: boolean,
): void {
	if (reads === null) return;
	let index = 0;
	for (const source of reads.reads.keys()) {
		if (index++ >= size) reads.reads.delete(source);
	}
	reads.mixed = mixed;
}

/** Serialize the values that produced accepted HTML, without reading live getters. */
export function serializeNativeSeedReads(
	reads: NativeReadWitness | null,
	initialDocumentSignals?: ScopeSeed,
): NativeSignalManifest | undefined {
	if (reads === null) return undefined;
	if (reads.mixed) throw new Error('Native signal revisions changed during server rendering.');
	const scopes = new Map<string, Map<string, SignalSeedEntry>>();
	const claims = new Map<string, NativeAdoptionOwner>();
	for (const [source, version] of reads.reads) {
		if (source.getVersion() !== version)
			throw new Error('Native signal revisions changed before server output was accepted.');
		const seeds = source.serialize?.(version);
		if (source.getVersion() !== version)
			throw new Error('Native signal revisions changed during server serialization.');
		if (seeds === undefined) {
			if (source.serialize !== undefined)
				throw new Error('A completed native server read has no serializable ready value.');
			continue;
		}
		for (const { owner, seed } of seeds) {
			const claimant = claims.get(seed.scopeKey);
			if (claimant !== undefined && claimant !== owner)
				throw new Error('Multiple data scopes claim native server key ' + seed.scopeKey + '.');
			claims.set(seed.scopeKey, owner);
			let entries = scopes.get(seed.scopeKey);
			if (entries === undefined) scopes.set(seed.scopeKey, (entries = new Map()));
			for (const entry of seed.entries) {
				const channel = (entry as SignalSeedEntry & { read?: string }).read ?? 'value';
				const key = channel + ':' + entry.key;
				const previous = entries.get(key);
				if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(entry))
					throw new Error(
						'Conflicting native signal seed for ' + seed.scopeKey + ':' + entry.key + '.',
					);
				entries.set(key, entry);
			}
		}
	}
	if (scopes.size === 0) return undefined;
	let references: NativeSignalReference[] | undefined;
	let initialDocumentScopeKey: string | undefined;
	if (initialDocumentSignals !== undefined) {
		const initial = getInitialDocumentCapture(initialDocumentSignals);
		initialDocumentScopeKey = initial.seed.scopeKey;
		const documentEntries = scopes.get(initialDocumentScopeKey);
		if (documentEntries !== undefined) {
			for (const [key, entry] of documentEntries) {
				// Matching includes the encoded value, read channel, and query metadata.
				// Initial signatures were captured once with the same canonical field order.
				if (initial.signatures.get(key) === seedEntrySignature(entry)) {
					(references ??= []).push({ key: entry.key, read: entry.read ?? 'value' });
					documentEntries.delete(key);
				}
			}
			if (references !== undefined && documentEntries.size === 0)
				scopes.delete(initialDocumentScopeKey);
		}
	}
	const serializedScopes = Array.from(scopes, ([scopeKey, entries]) => ({
		version: 1 as const,
		scopeKey,
		entries: Array.from(entries.values()),
	}));
	if (references !== undefined)
		return {
			version: 2,
			scopes: serializedScopes,
			initialDocument: { scopeKey: initialDocumentScopeKey!, entries: references },
		};
	return {
		version: 1,
		scopes: serializedScopes,
	};
}

export function parseNativeSignalManifest(raw: string): NativeSignalManifest {
	return validateNativeSignalManifest(JSON.parse(raw));
}

function validateNativeSignalManifest(value: unknown): NativeSignalManifest {
	if (
		value === null ||
		typeof value !== 'object' ||
		((value as NativeSignalManifest).version !== 1 &&
			(value as NativeSignalManifest).version !== 2) ||
		!Array.isArray((value as NativeSignalManifest).scopes)
	)
		throw new Error('Invalid native signal hydration manifest.');
	const manifest = value as NativeSignalManifest;
	const keys = new Set<string>();
	for (const scope of manifest.scopes) {
		if (
			scope === null ||
			typeof scope !== 'object' ||
			scope.version !== 1 ||
			typeof scope.scopeKey !== 'string' ||
			scope.scopeKey.length === 0 ||
			!Array.isArray(scope.entries) ||
			keys.has(scope.scopeKey)
		)
			throw new Error('Invalid or duplicate native signal hydration scope.');
		keys.add(scope.scopeKey);
	}
	if (manifest.version === 2) {
		const document = manifest.initialDocument;
		if (
			document === null ||
			typeof document !== 'object' ||
			typeof document.scopeKey !== 'string' ||
			!document.scopeKey.trim() ||
			!Array.isArray(document.entries) ||
			document.entries.length === 0
		)
			throw new Error('Invalid initial document signal references.');
		const references = new Set<string>();
		for (const reference of document.entries) {
			if (
				reference === null ||
				typeof reference !== 'object' ||
				typeof reference.key !== 'string' ||
				!reference.key.trim() ||
				!['value', 'latest', 'snapshot'].includes(reference.read) ||
				references.has(seedEntryKey(reference))
			)
				throw new Error('Invalid or duplicate initial document signal reference.');
			references.add(seedEntryKey(reference));
		}
	}
	return manifest;
}

/** Materialize this boundary's history, never the document's unreferenced values. */
export function materializeNativeSignalManifest(
	manifest: NativeSignalManifest,
	initialDocumentSignals?: ScopeSeed,
): Extract<NativeSignalManifest, { readonly version: 1 }> {
	if (manifest.version === 1) return manifest;
	validateNativeSignalManifest(manifest);
	if (initialDocumentSignals === undefined)
		throw new Error('Native signal hydration requires its initial document signal seed.');
	const document = manifest.initialDocument;
	const initial = getInitialDocumentCapture(initialDocumentSignals, document.scopeKey);
	const entries = new Map<string, SignalSeedEntry>();
	for (const reference of document.entries) {
		const key = seedEntryKey(reference);
		const entry = initial.entries.get(key);
		if (entry === undefined || entries.has(key))
			throw new Error('Missing or duplicate initial document signal reference.');
		entries.set(key, entry);
	}
	for (const scope of manifest.scopes) {
		if (scope.scopeKey !== document.scopeKey) continue;
		for (const entry of scope.entries) {
			const key = seedEntryKey(entry);
			if (entries.has(key))
				throw new Error('Overlapping initial document signal reference and boundary history.');
			entries.set(key, entry);
		}
	}
	return {
		version: 1,
		scopes: [
			...manifest.scopes.filter((scope) => scope.scopeKey !== document.scopeKey),
			{ version: 1, scopeKey: document.scopeKey, entries: Array.from(entries.values()) },
		],
	};
}

/**
 * One existing root/boundary adoption owns this state. Frames are acquired only
 * for data scopes actually read, keyed by exact owner identity. Nothing looks
 * up or retains live data scopes in a global registry.
 */
export function createNativeAdoptionState(
	manifest: NativeSignalManifest,
	initialDocumentSignals?: ScopeSeed,
) {
	const materialized = materializeNativeSignalManifest(manifest, initialDocumentSignals);
	const seeds = new Map(materialized.scopes.map((seed) => [seed.scopeKey, seed]));
	const frames = new Map<NativeAdoptionOwner, AdoptionFrame>();
	const claims = new Map<string, NativeAdoptionOwner>();
	let released = false;
	return {
		resolve(owner: NativeAdoptionOwner): AdoptionFrame | undefined {
			if (released) return undefined;
			const seed = seeds.get(owner.scopeKey);
			if (seed === undefined) return undefined;
			const claimant = claims.get(owner.scopeKey);
			if (claimant !== undefined && claimant !== owner)
				throw new Error('Multiple data scopes claim native hydration key ' + owner.scopeKey + '.');
			let frame = frames.get(owner);
			if (frame === undefined) {
				frame = owner.beginAdoption(seed);
				claims.set(owner.scopeKey, owner);
				frames.set(owner, frame);
			}
			return frame;
		},
		release(): void {
			if (released) return;
			released = true;
			let failure: unknown;
			let failed = false;
			try {
				for (const frame of frames.values()) {
					try {
						frame.release();
					} catch (error) {
						if (!failed) failure = error;
						failed = true;
					}
				}
			} finally {
				frames.clear();
				claims.clear();
				seeds.clear();
			}
			if (failed) throw failure;
		},
	};
}

export type NativeAdoptionState = ReturnType<typeof createNativeAdoptionState>;
