import type { AdoptionFrame, ScopeSeed, SignalSeedEntry } from './types.js';
import type { NativeReadWitness } from './native-read-collector.js';
import type { NativeAdoptionOwner, NativeReadSource } from './read-protocol.js';

export const NATIVE_SIGNAL_SEED_ATTR = 'data-octane-native-signals';
/** A server arm with untransportable demand is mounted fresh within its own range. */
export const NATIVE_SIGNAL_FRESH_COMMENT = 'oct-native-fresh:';

export interface NativeSignalManifest {
	readonly version: 1;
	readonly scopes: readonly ScopeSeed[];
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
	return {
		version: 1,
		scopes: Array.from(scopes, ([scopeKey, entries]) => ({
			version: 1,
			scopeKey,
			entries: Array.from(entries.values()),
		})),
	};
}

export function parseNativeSignalManifest(raw: string): NativeSignalManifest {
	const value: unknown = JSON.parse(raw);
	if (
		value === null ||
		typeof value !== 'object' ||
		(value as NativeSignalManifest).version !== 1 ||
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
	return manifest;
}

/**
 * One existing root/boundary adoption owns this state. Frames are acquired only
 * for data scopes actually read, keyed by exact owner identity. Nothing looks
 * up or retains live data scopes in a global registry.
 */
export function createNativeAdoptionState(manifest: NativeSignalManifest) {
	const seeds = new Map(manifest.scopes.map((seed) => [seed.scopeKey, seed]));
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
