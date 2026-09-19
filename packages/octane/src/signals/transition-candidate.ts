import type { NativeReadSource } from './read-protocol.js';
import { candidateGraph as bridge } from './transition-state.js';
import {
	registerNativeSignalActionExtension,
	type SignalActionFrame,
} from './transition-action.js';

export type { CandidatePreparation } from './transition-action.js';
export type SignalCandidateFrame = SignalActionFrame;

/**
 * A candidate-only source keeps existing consumer and memo witnesses alive when
 * its graph is released. Acceptance is restricted to graph-native sources whose
 * revisions are monotonic and whose subscription operations run no user code.
 * The caller installs canonical state before accepting, and accepts all sources
 * before releasing the candidate graph or invoking public callbacks.
 */
function createNativeReadCandidateSource(candidate: NativeReadSource) {
	let target: NativeReadSource | undefined = candidate;
	let accepted = false;
	let acceptedVersion = NaN;
	let canonicalVersion = NaN;
	const subscriptions = new Set<{ notify: () => void; dispose: () => void }>();
	const source: NativeReadSource = {
		getVersion: () =>
			target === undefined
				? NaN
				: !accepted
					? target.getVersion()
					: target.getVersion() === canonicalVersion
						? acceptedVersion
						: NaN,
		subscribe(notify) {
			if (target === undefined) throw new TypeError('The native read candidate has retired.');
			const subscription = { notify, dispose: target.subscribe(notify) };
			subscriptions.add(subscription);
			return () => {
				if (subscriptions.delete(subscription)) subscription.dispose();
			};
		},
		serialize(version) {
			return source.getVersion() === version
				? target?.serialize?.(accepted ? canonicalVersion : version)
				: undefined;
		},
	};
	if (candidate.inspect) source.inspect = () => target!.inspect!();
	return {
		source,
		accept(canonical: NativeReadSource, observedVersion: number): boolean {
			if (accepted || target === undefined || target.getVersion() !== observedVersion) return false;
			const version = canonical.getVersion();
			const acquired = new Map<{ notify: () => void; dispose: () => void }, () => void>();
			try {
				for (const subscription of subscriptions)
					acquired.set(subscription, canonical.subscribe(subscription.notify));
			} catch (error) {
				for (const dispose of acquired.values()) dispose();
				throw error;
			}
			// Every canonical lease precedes any candidate lease release.
			acceptedVersion = observedVersion;
			canonicalVersion = version;
			target = canonical;
			accepted = true;
			if (!canonical.inspect) delete source.inspect;
			for (const [subscription, dispose] of acquired) {
				subscription.dispose();
				subscription.dispose = dispose;
			}
			return true;
		},
		discard(): void {
			if (accepted || target === undefined) return;
			target = undefined;
			delete source.inspect;
			for (const subscription of subscriptions) subscription.dispose();
			subscriptions.clear();
		},
	};
}

let installed = false;

/** Enable native forwarding leases without creating a graph or frame. */
export function installNativeSignalActionExtension(): void {
	if (installed) return;
	installed = true;
	registerNativeSignalActionExtension({
		source(entry, read, source) {
			const sources = (entry.sources ??= {});
			return (sources[read] ??= createNativeReadCandidateSource(source)).source;
		},
		accept(prepared) {
			for (const { entry, revision } of prepared) {
				if (!entry.sources) continue;
				for (const read of ['value', 'latest', 'snapshot'] as const) {
					const source = entry.sources[read];
					if (!source) continue;
					const field =
						read === 'value'
							? 'nativeSource'
							: read === 'latest'
								? 'nativeLatestSource'
								: 'nativeSnapshotSource';
					source.accept(
						(entry.node[field] ??= bridge.createNativeSource(entry.node, read)),
						revision,
					);
				}
			}
		},
		release(entry) {
			if (entry.sources) for (const source of Object.values(entry.sources)) source.discard();
		},
	});
}
