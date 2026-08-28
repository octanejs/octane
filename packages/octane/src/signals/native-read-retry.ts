import type { NativeReadWitness } from './native-read-collector.js';
import type { NativeReadSource } from './read-protocol.js';
import { inspectNativeReadSource } from './native-read-inspection.js';

/**
 * A failed first mount may be disposed before an abort-ignoring promise settles.
 * Its existing root or boundary retry episode retains only these source leases,
 * not the discarded component Scope or its output/effect closures.
 */
export function createNativeReadRetry(notify: () => void) {
	const sources = new Map<NativeReadSource, () => void>();
	let generation = 0;
	return {
		/** Retry leases have no accepted read revision and expose no values. */
		inspect() {
			return Array.from(sources.keys(), (source) => inspectNativeReadSource(source, null));
		},
		get generation(): number {
			return generation;
		},
		track(witness: NativeReadWitness): void {
			let invalid = witness.mixed;
			for (const [source, version] of witness.reads) {
				if (!sources.has(source)) sources.set(source, source.subscribe(notify));
				if (source.getVersion() !== version) invalid = true;
			}
			if (invalid) notify();
		},
		clear(): void {
			generation++;
			for (const dispose of sources.values()) dispose();
			sources.clear();
		},
	};
}

export type NativeReadRetry = ReturnType<typeof createNativeReadRetry>;
