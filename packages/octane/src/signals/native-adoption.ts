import { formatClientError } from '../error-codes.client.generated.js';
import type { AdoptionFrame, ScopeSeed, SignalSeedEntry } from './types.js';
import type { NativeAdoptionOwner } from './read-protocol.js';
import {
	captureInitialDocumentSignals,
	getInitialDocumentCapture,
	seedEntryKey,
	validateNativeSignalManifest,
	type NativeSignalManifest,
} from './native-read-seeds.js';

// Only the renderer adopts a native seed manifest. Islands and streamed result
// bootstraps share native-read-seeds.ts, so this half stays out of their chunk.

export function parseNativeSignalManifest(raw: string): NativeSignalManifest {
	return validateNativeSignalManifest(JSON.parse(raw));
}

/** Materialize this boundary's history, never the document's unreferenced values. */
export function materializeNativeSignalManifest(
	manifest: NativeSignalManifest,
	initialDocumentSignals?: ScopeSeed,
): Extract<NativeSignalManifest, { readonly version: 1 }> {
	if (manifest.version === 1) return manifest;
	validateNativeSignalManifest(manifest);
	if (initialDocumentSignals === undefined) throw new Error(formatClientError(185));
	const document = manifest.initialDocument;
	const initial = getInitialDocumentCapture(initialDocumentSignals, document.scopeKey);
	const entries = new Map<string, SignalSeedEntry>();
	for (const reference of document.entries) {
		const key = seedEntryKey(reference);
		const entry = initial.entries.get(key);
		if (entry === undefined || entries.has(key)) throw new Error(formatClientError(186));
		entries.set(key, entry);
	}
	for (const scope of manifest.scopes) {
		if (scope.scopeKey !== document.scopeKey) continue;
		for (const entry of scope.entries) {
			const key = seedEntryKey(entry);
			if (entries.has(key)) throw new Error(formatClientError(187));
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
	initialScopeKey?: string,
) {
	if (initialDocumentSignals !== undefined && initialScopeKey !== undefined)
		initialDocumentSignals = captureInitialDocumentSignals(initialDocumentSignals, initialScopeKey);
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
				throw new Error(formatClientError(188, owner.scopeKey));
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
