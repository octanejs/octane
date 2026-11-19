import { __withBindingObservations, type BindingObservations } from './dom-binding-observations.js';
import { formatClientError } from './error-codes.client.generated.js';
import { __normalizeBinding, type BindingOperation, type BindingValue } from './dom-bindings.js';
import { __createBindingStyles, __retiredBindingSource } from './dom-binding-styles.js';
import type { BindingSignalConnection } from './dom-binding-signals.js';
import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import {
	beginNativeWriteGuard,
	endNativeWriteGuard,
	setNativeReadObserver,
	type NativeReadObserver,
	type NativeReadSource,
	type NativeReadSubscription,
} from './signals/read-protocol.js';

export type BindingProjectionGroup = readonly (readonly [index: number, field: string])[];

interface ProjectionRead {
	version: number;
	mode: number;
}
type ProjectionObserver = NativeReadObserver & {
	__domBoundary: number;
	__domHandle?: unknown;
	__domResolved?: unknown;
	__domSource?: NativeReadSource | undefined;
};
const DIRECT = 1;
const EXPRESSION = 2;

export interface BindingProjectionConnection {
	readonly group: BindingProjectionGroup;
	read(compute: unknown): BindingValue[];
	get(committed?: boolean): BindingValue[];
	publishCommitted(): void;
	writeStyle(index: number, value: BindingValue): void;
	/** Error path only: whether the owner of a source this group observes retired. */
	retired(): boolean;
	accept(): void;
	dispose(preservePresentation?: boolean): void;
}

/** Optional, view-owned projections share a read and prepare every field before any write. */
const createBindingProjections = function __createBindingProjections(
	observations?: BindingObservations,
) {
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	const styles = __createBindingStyles(observations);
	return {
		connect(
			group: BindingProjectionGroup,
			bindings: readonly BindingOperation[],
			nodes: readonly Node[],
			notify: (committed?: boolean) => void,
			restoreStyles = false,
		): BindingProjectionConnection {
			let compute: (() => Record<string, unknown> | null | undefined) | undefined;
			let acceptedCompute: typeof compute;
			let currentValues: BindingValue[] = [];
			let acceptedValues: BindingValue[] = [];
			let currentReads = new Map<NativeReadSource, ProjectionRead>();
			let acceptedReads = currentReads;
			let currentAmbiguous = false;
			let acceptedAmbiguous = false;
			let trigger: NativeReadSource | undefined;
			let triggers: Set<NativeReadSource> | undefined;
			let committedChildren: Set<number> | undefined;
			let replayReads: Map<NativeReadSource, ProjectionRead> | undefined;
			let replayValues: BindingValue[] | undefined;
			let replayStyles: Map<number, unknown> | undefined;
			let disposed = false;
			const subscriptions = new Map<NativeReadSource, (inspect?: boolean) => boolean | void>();
			const styleConnections = new Map<number, BindingSignalConnection>();
			const observation = observations?.owner(() => {
				acceptedCompute = compute;
				acceptedValues = currentValues;
				acceptedReads = currentReads;
				acceptedAmbiguous = currentAmbiguous;
				for (const style of styleConnections.values()) style.publishAccepted?.();
			});
			const notifyProjection = (committed?: boolean): void => {
				if (committed && trigger) (triggers ??= new Set()).add(trigger);
				notify(committed);
			};
			const get = (committed = false): BindingValue[] => {
				if (disposed) return [];
				let expected: Map<NativeReadSource, number> | undefined;
				let fallback: BindingValue[] | undefined;
				if (committed) {
					replayReads = replayValues = replayStyles = undefined;
					fallback = [...acceptedValues];
					if (committedChildren?.size) {
						for (const index of committedChildren)
							fallback[index] = styleConnections.get(index)!.get(true) as BindingValue;
						committedChildren.clear();
						replayReads = acceptedReads;
						replayValues = fallback;
					}
					const notified = triggers;
					triggers = undefined;
					if (!notified?.size || acceptedAmbiguous) return fallback;
					expected = new Map();
					for (const [source, read] of acceptedReads) {
						const version = source.getVersion();
						if (notified.has(source)) {
							const candidate = currentReads.get(source);
							if (
								read.mode !== DIRECT ||
								(candidate && (candidate.mode !== DIRECT || candidate.version !== read.version))
							)
								return fallback;
						} else {
							if (version !== read.version) return fallback;
							expected.set(source, version);
						}
					}
					for (const source of notified) if (!acceptedReads.has(source)) return fallback;
				}
				const reads = new Map<NativeReadSource, ProjectionRead>();
				let ambiguous = false;
				const observer = ((source, version) => {
					const boundary = observer.__domBoundary;
					let mode = EXPRESSION;
					if (boundary) {
						const prior = observer.__domSource;
						if (prior && prior !== source) ambiguous = true;
						else observer.__domSource = source;
						const matcher = (
							source as NativeReadSource & { __matchesNativeDomHandle?(handle: unknown): boolean }
						).__matchesNativeDomHandle;
						if (matcher?.call(source, observer.__domResolved)) mode = DIRECT;
						else ambiguous = true;
					}
					const seen = reads.get(source);
					if (seen) {
						if (seen.version !== version) ambiguous = true;
						seen.mode |= mode;
					} else reads.set(source, { version, mode });
					if (!committed) previousObserver?.(source, version);
				}) as ProjectionObserver;
				observer.__domBoundary = 0;
				const previousObserver = setNativeReadObserver(observer);
				const guard = beginNativeWriteGuard();
				const values: BindingValue[] = [];
				let sampledStyles: Map<number, unknown> | undefined;
				try {
					run(() => {
						const result = (committed ? acceptedCompute : compute)!();
						for (const [index, field] of group) {
							if (disposed) break;
							const binding = bindings[index]!;
							const value = result?.[field];
							if (binding[1] === 'styleObject') {
								let style = styleConnections.get(index);
								if (committed) {
									const sampled = style!.readAccepted!(value);
									if (!sampled.valid) {
										ambiguous = true;
										break;
									}
									values[index] = sampled.value as BindingValue;
									(sampledStyles ??= new Map()).set(index, value);
									continue;
								}
								if (!style) {
									style = styles.connect(
										nodes[binding[0]] as Element,
										(committed) => {
											if (committed) (committedChildren ??= new Set()).add(index);
											notifyProjection(committed);
										},
										restoreStyles,
										observation,
									);
									styleConnections.set(index, style);
								}
								values[index] = style.read(value) as BindingValue;
							} else values[index] = __normalizeBinding(binding, value);
						}
					});
				} finally {
					endNativeWriteGuard(guard);
					setNativeReadObserver(previousObserver);
					if (!committed) {
						currentReads = reads;
						currentAmbiguous = ambiguous;
					}
				}
				if (committed) {
					if (ambiguous || reads.size !== acceptedReads.size) return fallback!;
					for (const [source, read] of reads)
						if (
							read.mode !== acceptedReads.get(source)?.mode ||
							(expected!.has(source) && read.version !== expected!.get(source)) ||
							source.getVersion() !== read.version
						)
							return fallback!;
					replayReads = reads;
					replayValues = values;
					replayStyles = sampledStyles;
					return values;
				}
				for (const [source, stop] of subscriptions) {
					if (reads.has(source)) continue;
					subscriptions.delete(source);
					stop();
				}
				for (const [source, { version }] of reads) {
					if (disposed) break;
					if (!subscriptions.has(source)) {
						let active = true;
						let stop: NativeReadSubscription | undefined;
						stop = run(() =>
							source.subscribe(() => {
								if (!disposed) {
									if (active && !observations) notify();
									else if (!active && observations && source.retired?.())
										observations.retire(observation!, stop);
									else if (observations) {
										const prior = trigger;
										trigger = source;
										try {
											observations.notify(
												observation!,
												stop,
												notifyProjection,
												active && compute !== acceptedCompute,
											);
										} finally {
											trigger = prior;
										}
									}
								}
							}, !!observations),
						);
						if (typeof stop !== 'function') throw new TypeError(formatClientError(304));
						if (observations && !observations.add(observation!, stop)) break;
						const cleanup = (inspect = false): boolean | void => {
							if (inspect) return !observation?.pending?.has(stop!);
							active = false;
							observations ? observations.release(observation!, stop!) : stop!();
						};
						if (disposed) cleanup();
						else subscriptions.set(source, cleanup);
					}
					if (!disposed && source.getVersion() !== version)
						observations
							? observations.notify(observation!, undefined, notifyProjection)
							: notify();
				}
				currentValues = values;
				return values;
			};
			return {
				group,
				get,
				publishCommitted() {
					if (replayReads && replayValues) {
						acceptedReads = replayReads;
						acceptedValues = replayValues;
						for (const [index, value] of replayStyles ?? [])
							styleConnections.get(index)!.publishAcceptedValue!(value);
						replayReads = replayValues = undefined;
						replayStyles = undefined;
					}
				},
				accept: () => {
					if (
						observation &&
						(compute !== acceptedCompute ||
							currentValues !== acceptedValues ||
							observation.pending?.size ||
							observation.retired?.size)
					)
						observations!.accept(observation);
				},
				retired: () =>
					__retiredBindingSource(
						subscriptions,
						observations ? (stop) => (stop as (inspect: boolean) => boolean)(true) : undefined,
					) || [...styleConnections.values()].some((style) => style.retired()),
				read(next) {
					if (typeof next !== 'function') throw new TypeError(formatClientError(305));
					compute = next as typeof compute;
					return get();
				},
				writeStyle(index, value) {
					if (!disposed) styleConnections.get(index)!.write!(value);
				},
				dispose(preservePresentation) {
					if (disposed) return;
					disposed = true;
					compute = undefined;
					let failed = false;
					let failure: unknown;
					for (const cleanup of [
						...subscriptions.values(),
						...[...styleConnections.values()].map(
							(style) => () => style.dispose(preservePresentation),
						),
					]) {
						try {
							cleanup();
						} catch (error) {
							if (!failed) {
								failed = true;
								failure = error;
							}
						}
					}
					subscriptions.clear();
					styleConnections.clear();
					if (observation) observations!.accept(observation);
					if (failed) throw failure;
				},
			};
		},
	};
};

export const __createBindingProjections =
	/* @__PURE__ */ __withBindingObservations(createBindingProjections);
