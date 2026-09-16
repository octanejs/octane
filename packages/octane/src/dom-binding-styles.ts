import { cssStyleValue, hyphenateStyleName } from './dom-tables.js';
import { __writeBinding, type BindingValue } from './dom-bindings.js';
import type { BindingSignalConnection } from './dom-binding-signals.js';
import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import {
	beginNativeWriteGuard,
	endNativeWriteGuard,
	readNativeDomStyle,
	setNativeReadObserver,
	type NativeReadSource,
} from './signals/read-protocol.js';

/** Canonical style values after native handles and CSS units have been resolved. */
export type BindingStyleSnapshot = Readonly<Record<string, string | null>>;

/** Shared preparation keeps native style projections on the canonical CSS rules. */
export function __normalizeBindingStyle(value: unknown): BindingValue {
	if (value == null || value === false || value === '') return null;
	if (typeof value === 'string') return value;
	if (typeof value !== 'object')
		throw new TypeError('A whole-style DOM binding requires a style object, CSS text or null.');
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
export function __createBindingStyles() {
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	return {
		connect(node: Element, notify: () => void, restoreStyles = false): BindingSignalConnection {
			let raw: unknown;
			let disposed = false;
			const subscriptions = new Map<NativeReadSource, () => void>();
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
			const get = (): BindingValue => {
				if (disposed) return null;
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
						const stop = run(() =>
							source.subscribe(() => {
								if (active && !disposed) notify();
							}),
						);
						if (typeof stop !== 'function')
							throw new TypeError('A DOM style subscription must return cleanup.');
						const disposeSource = (): void => {
							active = false;
							stop();
						};
						if (disposed) disposeSource();
						else subscriptions.set(source, disposeSource);
					}
					if (!disposed && source.getVersion() !== version) notify();
				}
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
				dispose() {
					if (disposed) return;
					disposed = true;
					raw = previous = null;
					let failed = false;
					let failure: unknown;
					for (const stop of [...subscriptions.values(), restore]) {
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
					if (failed) throw failure;
				},
			};
		},
	};
}
