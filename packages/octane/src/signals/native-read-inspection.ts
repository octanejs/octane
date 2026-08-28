import type { NativeReadWitness } from './native-read-collector.js';
import type { NativeReadInspection, NativeReadSource } from './read-protocol.js';

export interface NativeReadObservation {
	/** Null for a retry lease, which retains sources rather than an accepted snapshot. */
	readonly observedVersion: number | null;
	readonly currentVersion: number;
	readonly source: NativeReadInspection | null;
}

export interface NativeReadAttemptInspection {
	readonly mixed: boolean;
	readonly reads: readonly NativeReadObservation[];
}

export function inspectNativeReadSource(
	source: NativeReadSource,
	observedVersion: number | null,
): NativeReadObservation {
	return {
		observedVersion,
		currentVersion: source.getVersion(),
		source: source.inspect?.() ?? null,
	};
}

/** Copy metadata only; never evaluate a read, serialize a value, or subscribe. */
export function inspectNativeReadWitness(witness: NativeReadWitness): NativeReadAttemptInspection {
	return {
		mixed: witness.mixed,
		reads: Array.from(witness.reads, ([source, version]) =>
			inspectNativeReadSource(source, version),
		),
	};
}
