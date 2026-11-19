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
	type NativeReadSource,
	type NativeReadSubscription,
} from './signals/read-protocol.js';

export type BindingProjectionGroup = readonly (readonly [index: number, field: string])[];

export interface BindingProjectionConnection {
	readonly group: BindingProjectionGroup;
	read(compute: unknown): BindingValue[];
	get(): BindingValue[];
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
			notify: () => void,
			restoreStyles = false,
		): BindingProjectionConnection {
			const observation = observations?.owner();
			let compute: (() => Record<string, unknown> | null | undefined) | undefined;
			let disposed = false;
			const subscriptions = new Map<NativeReadSource, (inspect?: boolean) => boolean | void>();
			const styleConnections = new Map<number, BindingSignalConnection>();
			const get = (): BindingValue[] => {
				if (disposed) return [];
				const reads = new Map<NativeReadSource, number>();
				const previousObserver = setNativeReadObserver((source, version) => {
					// Preserve the first witness so a mixed read cannot pass validation.
					if (!reads.has(source)) reads.set(source, version);
					previousObserver?.(source, version);
				});
				const guard = beginNativeWriteGuard();
				const values: BindingValue[] = [];
				try {
					run(() => {
						const result = compute!();
						for (const [index, field] of group) {
							if (disposed) break;
							const binding = bindings[index]!;
							const value = result?.[field];
							if (binding[1] === 'styleObject') {
								let style = styleConnections.get(index);
								if (!style) {
									style = styles.connect(
										nodes[binding[0]] as Element,
										notify,
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
				}
				for (const [source, stop] of subscriptions) {
					if (reads.has(source)) continue;
					subscriptions.delete(source);
					stop();
				}
				for (const [source, version] of reads) {
					if (disposed) break;
					if (!subscriptions.has(source)) {
						let active = true;
						let stop: NativeReadSubscription | undefined;
						stop = run(() =>
							source.subscribe(() => {
								if (!disposed) {
									if (active)
										observations ? observations.notify(observation!, stop, notify) : notify();
									else if (observations && source.retired?.())
										observations.retire(observation!, stop);
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
						observations ? observations.notify(observation!, undefined, notify) : notify();
				}
				return values;
			};
			return {
				group,
				get,
				accept: () => observation && observations!.accept(observation),
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
