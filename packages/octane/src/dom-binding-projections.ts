import { __normalizeBinding, type BindingOperation, type BindingValue } from './dom-bindings.js';
import { __createBindingStyles, __prepareBindingSources } from './dom-binding-styles.js';
import type { BindingPreparedValue, BindingSignalConnection } from './dom-binding-signals.js';
import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import {
	beginNativeWriteGuard,
	endNativeWriteGuard,
	forwardNativeTransitionConsumer,
	setNativeReadObserver,
	type NativeReadSource,
} from './signals/read-protocol.js';

export type BindingProjectionGroup = readonly (readonly [index: number, field: string])[];

export interface BindingProjectionConnection {
	readonly group: BindingProjectionGroup;
	read(compute: unknown): BindingValue[];
	get(): BindingValue[];
	preview(compute: unknown): BindingPreparedValue<BindingValue[]>;
	writeStyle(index: number, value: BindingValue): void;
	dispose(preservePresentation?: boolean): void;
}

/** Optional, view-owned projections share a read and prepare every field before any write. */
export function __createBindingProjections() {
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	const styles = __createBindingStyles();
	return {
		connect(
			group: BindingProjectionGroup,
			bindings: readonly BindingOperation[],
			nodes: readonly Node[],
			notify: () => void,
			restoreStyles = false,
		): BindingProjectionConnection {
			let compute: (() => Record<string, unknown> | null | undefined) | undefined;
			let disposed = false;
			const subscriptions = new Map<NativeReadSource, () => void>();
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
									style = styles.connect(nodes[binding[0]] as Element, notify, restoreStyles);
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
						const stop = run(() =>
							source.subscribe(
								forwardNativeTransitionConsumer(notify, () => {
									if (active && !disposed) notify();
								}),
							),
						);
						if (typeof stop !== 'function')
							throw new TypeError('A DOM projection subscription must return cleanup.');
						const cleanup = (): void => {
							active = false;
							stop();
						};
						if (disposed) cleanup();
						else subscriptions.set(source, cleanup);
					}
					if (!disposed && source.getVersion() !== version) notify();
				}
				return values;
			};
			return {
				group,
				get,
				preview(next): BindingPreparedValue<BindingValue[]> {
					if (typeof next !== 'function')
						throw new TypeError('A DOM binding projection group requires a computation.');
					const reads = new Map<NativeReadSource, number>();
					const preparedStyles: BindingPreparedValue[] = [];
					const createdStyles = new Map<number, BindingSignalConnection>();
					const values: BindingValue[] = [];
					const previousObserver = setNativeReadObserver((source, version) => {
						if (!reads.has(source)) reads.set(source, version);
						previousObserver?.(source, version);
					});
					const guard = beginNativeWriteGuard();
					try {
						run(() => {
							const result = next();
							for (const [index, field] of group) {
								const binding = bindings[index]!;
								const value = result?.[field];
								if (binding[1] === 'styleObject') {
									let style = styleConnections.get(index);
									if (!style) {
										style = styles.connect(nodes[binding[0]] as Element, notify, restoreStyles);
										createdStyles.set(index, style);
									}
									const prepared = style.preview(value);
									preparedStyles.push(prepared);
									values[index] = prepared.value as BindingValue;
								} else values[index] = __normalizeBinding(binding, value);
							}
						});
					} catch (error) {
						for (const prepared of preparedStyles) prepared.discard();
						for (const style of createdStyles.values()) style.dispose(true);
						throw error;
					} finally {
						endNativeWriteGuard(guard);
						setNativeReadObserver(previousObserver);
					}
					let prepared;
					try {
						prepared = __prepareBindingSources(reads, subscriptions, notify, () => !disposed, run);
					} catch (error) {
						for (const style of preparedStyles) style.discard();
						for (const style of createdStyles.values()) style.dispose(true);
						throw error;
					}
					let accepted = false;
					return {
						value: values,
						validate: () =>
							prepared.validate() && preparedStyles.every((style) => style.validate()),
						commit() {
							accepted = true;
							compute = next as typeof compute;
							for (const [index, style] of createdStyles) styleConnections.set(index, style);
							for (const style of preparedStyles) style.commit();
							prepared.commit();
						},
						discard() {
							if (accepted) return;
							prepared.discard();
							for (const style of preparedStyles) style.discard();
							for (const style of createdStyles.values()) style.dispose(true);
						},
					};
				},
				read(next) {
					if (typeof next !== 'function')
						throw new TypeError('A DOM binding projection group requires a computation.');
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
					if (failed) throw failure;
				},
			};
		},
	};
}
