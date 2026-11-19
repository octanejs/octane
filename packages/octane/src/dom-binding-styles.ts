import {
	__withBindingObservations,
	type BindingObservationOwner,
	type BindingObservations,
} from './dom-binding-observations.js';
import { formatClientError } from './error-codes.client.generated.js';
import { cssStyleValue, hyphenateStyleName } from './style-values.js';
import { __writeBinding, type BindingValue } from './dom-bindings.js';
import type { BindingSignalConnection } from './dom-binding-signals.js';
import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import {
	beginNativeWriteGuard,
	endNativeWriteGuard,
	readNativeDomStyle,
	setNativeReadObserver,
	type NativeReadSource,
	type NativeReadSubscription,
} from './signals/read-protocol.js';

/** Error path only: whether a subscribed source's owner retired. */
export function __retiredBindingSource(
	subscriptions: Map<NativeReadSource, unknown>,
	committed?: (stop: unknown) => boolean,
): boolean {
	for (const [source, stop] of subscriptions)
		if (source.retired?.() && (!committed || committed(stop))) return true;
	return false;
}

/** Canonical style values after native handles and CSS units have been resolved. */
export type BindingStyleSnapshot = Readonly<Record<string, string | null>>;

/** Shared preparation keeps native style projections on the canonical CSS rules. */
export function __normalizeBindingStyle(value: unknown): BindingValue {
	if (value == null || value === false || value === '') return null;
	if (typeof value === 'string') return value;
	if (typeof value !== 'object') throw new TypeError(formatClientError(311));
	const result: Record<string, string | null> = Object.create(null);
	for (const name in value) {
		const property = (value as Record<string, unknown>)[name];
		// Preserve authored alias order around shorthand declarations.
		result[name] =
			property == null || typeof property === 'boolean' ? null : cssStyleValue(name, property);
	}
	return result;
}

/**
 * Query-selected whole-style capability. Native source subscriptions belong to
 * this binding lifetime; the existing graph and canonical style reader own all
 * signal semantics. Fixed-property artifacts never import this module.
 */
const createBindingStyles = function __createBindingStyles(observations?: BindingObservations) {
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	return {
		connect(
			node: Element,
			notify: (committed?: boolean) => void,
			restoreStyles = false,
			sharedObservation?: BindingObservationOwner,
		): BindingSignalConnection {
			let raw: unknown;
			let acceptedRaw: unknown;
			let currentSources: Map<NativeReadSource, number> | undefined;
			let acceptedSources: Map<NativeReadSource, number> | undefined;
			const publishAccepted = (): void => {
				acceptedRaw = raw;
				acceptedSources = currentSources;
			};
			const observation = sharedObservation ?? observations?.owner(publishAccepted);
			let disposed = false;
			const subscriptions = new Map<NativeReadSource, (inspect?: boolean) => boolean | void>();
			let previous: BindingValue = null;
			let firstWrite = true;
			const style = (node as HTMLElement | SVGElement).style;
			let restorations: Set<string> | undefined;
			let baseline: HTMLElement | undefined;
			let expected: HTMLElement | undefined;
			let probe: HTMLElement | undefined;
			const snapshotDOM = (): BindingStyleSnapshot => {
				const result: Record<string, string> = Object.create(null);
				for (let i = 0; i < style.length; i++) {
					const name = style.item(i);
					result[name] =
						style.getPropertyValue(name) + (style.getPropertyPriority(name) ? ' !important' : '');
				}
				return result;
			};
			previous = snapshotDOM();
			const sampleAccepted = (value: unknown, sources?: Set<NativeReadSource>): BindingValue => {
				const previousObserver = setNativeReadObserver(
					sources ? (source) => sources.add(source) : null,
				);
				const guard = beginNativeWriteGuard();
				try {
					return run(() => __normalizeBindingStyle(readNativeDomStyle(value)));
				} finally {
					endNativeWriteGuard(guard);
					setNativeReadObserver(previousObserver);
				}
			};
			const readAccepted = (value: unknown): { valid: boolean; value: BindingValue } => {
				const sources = new Set<NativeReadSource>();
				const sampled = sampleAccepted(value, sources);
				return {
					valid:
						sources.size === (acceptedSources?.size ?? 0) &&
						[...sources].every((source) => acceptedSources?.has(source)),
					value: sampled,
				};
			};
			const get = (committed = false): BindingValue => {
				if (disposed) return null;
				if (committed) return sampleAccepted(acceptedRaw);
				const reads = new Map<NativeReadSource, number>();
				const previousObserver = setNativeReadObserver((source, version) =>
					reads.set(source, version),
				);
				const guard = beginNativeWriteGuard();
				let value: BindingValue;
				try {
					value = run(() => __normalizeBindingStyle(readNativeDomStyle(raw)));
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
						// A callback retained by an old source cannot publish after its
						// subscription was removed or replaced by a newer generation.
						let active = true;
						let stop: NativeReadSubscription | undefined;
						stop = run(() =>
							source.subscribe(() => {
								if (!disposed) {
									if (active)
										observations
											? observations.notify(observation!, stop, notify, raw !== acceptedRaw)
											: notify();
									else if (observations) {
										if (source.retired?.()) observations.retire(observation!, stop);
										else observations.notify(observation!, stop, notify);
									}
								}
							}, !!observations),
						);
						if (typeof stop !== 'function') throw new TypeError(formatClientError(312));
						if (observations && !observations.add(observation!, stop)) break;
						const disposeSource = (inspect = false): boolean | void => {
							if (inspect) return !observation?.pending?.has(stop!);
							active = false;
							observations ? observations.release(observation!, stop!) : stop!();
						};
						if (disposed) disposeSource();
						else subscriptions.set(source, disposeSource);
					}
					if (!disposed && source.getVersion() !== version)
						observations ? observations.notify(observation!, undefined, notify) : notify();
				}
				currentSources = reads;
				return value;
			};
			const writeProperty = (name: string, value: string | null): void => {
				if (disposed) return;
				name = hyphenateStyleName(name);
				const operation = [0, 'styleProperty', name] as const;
				if (restoreStyles) {
					if (!baseline) {
						baseline = node.ownerDocument.createElement('i');
						expected = node.ownerDocument.createElement('i');
						baseline.style.cssText = expected.style.cssText = style.cssText;
						restorations = new Set();
					}
					restorations!.add(name);
					// One shared prediction accounts for our own shorthand/longhand
					// interactions, including disposal during a synchronous native write.
					__writeBinding(expected!, operation, value);
				}
				__writeBinding(node, operation, value);
			};
			const restore = (): void => {
				if (!restorations) return;
				// Decide ownership before restoring: writing one shorthand must not
				// change whether a later longhand still matches our last write.
				const owned = [...restorations].filter(
					(name) =>
						style.getPropertyValue(name) === expected!.style.getPropertyValue(name) &&
						style.getPropertyPriority(name) === expected!.style.getPropertyPriority(name),
				);
				let failed = false;
				let failure: unknown;
				for (const name of owned) {
					try {
						const value = baseline!.style.getPropertyValue(name);
						if (value === '') style.removeProperty(name);
						else style.setProperty(name, value, baseline!.style.getPropertyPriority(name));
					} catch (error) {
						if (!failed) {
							failed = true;
							failure = error;
						}
					}
				}
				if (failed) throw failure;
			};
			return {
				get,
				readAccepted,
				publishAccepted,
				publishAcceptedValue(value) {
					acceptedRaw = value;
				},
				accept: () => {
					if (
						observation &&
						(raw !== acceptedRaw || observation.pending?.size || observation.retired?.size)
					)
						observations!.accept(observation);
				},
				retired: () =>
					__retiredBindingSource(
						subscriptions,
						observations ? (stop) => (stop as (inspect: boolean) => boolean)(true) : undefined,
					),
				read(value) {
					raw = value;
					return get();
				},
				write(value) {
					if (disposed) return;
					let next = value as BindingValue;
					let old = typeof previous === 'string' ? snapshotDOM() : previous;
					const writeAll = firstWrite || typeof previous === 'string' || typeof value === 'string';
					if (typeof next === 'string') {
						// A CSS-text declaration owns the entire inline style, including
						// native additions since the last object snapshot.
						probe ??= node.ownerDocument.createElement('i');
						probe.style.cssText = next;
						const parsed: Record<string, string> = Object.create(null);
						for (let i = 0; i < probe.style.length; i++) {
							const name = probe.style.item(i);
							parsed[name] =
								probe.style.getPropertyValue(name) +
								(probe.style.getPropertyPriority(name) ? ' !important' : '');
						}
						next = parsed;
						old = snapshotDOM();
					}
					// Publish ownership before native writes: a synchronous attribute
					// reaction may dispose this connection during the first property.
					previous = typeof value === 'string' ? value : next;
					// The initial CSSOM snapshot has native keys, not authored aliases.
					// Retain matching server declarations, then replay the authored
					// order once; equality against CSSOM cannot prove cascade order.
					const initialNames =
						firstWrite && next && typeof next === 'object'
							? new Set(Object.keys(next).map(hyphenateStyleName))
							: null;
					firstWrite = false;
					if (old && typeof old === 'object')
						for (const name in old)
							if (next === null || (initialNames ? !initialNames.has(name) : !(name in next)))
								writeProperty(name, null);
					if (next && typeof next === 'object')
						for (const name in next)
							if (writeAll || old === null || typeof old !== 'object' || next[name] !== old[name])
								writeProperty(name, next[name]!);
				},
				dispose(preservePresentation) {
					if (disposed) return;
					disposed = true;
					raw = previous = null;
					let failed = false;
					let failure: unknown;
					for (const stop of [
						...subscriptions.values(),
						...(preservePresentation ? [] : [restore]),
					]) {
						try {
							stop();
						} catch (error) {
							if (!failed) {
								failed = true;
								failure = error;
							}
						}
					}
					subscriptions.clear();
					restorations?.clear();
					probe = baseline = expected = undefined;
					if (observation) observations!.accept(observation);
					if (failed) throw failure;
				},
			};
		},
	};
};

export const __createBindingStyles = /* @__PURE__ */ __withBindingObservations(createBindingStyles);
