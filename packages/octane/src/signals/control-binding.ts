import {
	consumeHydrationControl,
	initializeHydrationControlCapture,
	snapshotHydrationControl,
} from '../hydration/control-capture.js';
import {
	hasHydrationControlSignalWriter,
	registerHydrationControlSignalWriter,
} from './early-values.js';
import { isSignalHandle, isWritableSignal } from './handle-protocol.js';
import {
	CONTROL_BINDINGS,
	CONTROL_HANDOFF,
	type ControlHandoff,
	type SignalControlBinding,
} from './control-handoff.js';
import { captureSignalOwner, currentSignalOwner } from './owner-context.js';
import {
	forwardNativeTransitionConsumer,
	NATIVE_TRANSITION_CONSUMER,
	type NativeTransitionNotify,
} from './read-protocol.js';
import {
	SIGNAL_BINDING_IDENTITY,
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
	SIGNAL_OWNER_RESOLVE,
	type SignalHandle,
	type SignalOwner,
} from './types.js';
import { withoutSignalCandidate } from './transition-state.js';

type SignalControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type ControlChannel = 'value' | 'checked';
const RADIO_WRITERS = /* @__PURE__ */ new WeakMap<Element, (value: unknown) => void>();

// Sampled JSX values use the native renderer's scalar coercion, not the stricter
// writable-handle contract. Keep this optional leaf independent of the renderer.
function controlString(value: unknown): string {
	return typeof value === 'string'
		? value
		: typeof value === 'function' || typeof value === 'symbol'
			? ''
			: String(value);
}

/** Publish the platform's native radio-group edit, never arbitrate a checked write. */
function publishRadioInput(input: HTMLInputElement): void {
	const root = input.getRootNode();
	const group =
		input.form !== null
			? input.form.elements
			: root.nodeType === 9
				? (root as Document).getElementsByName(input.name)
				: (root as Element | DocumentFragment).querySelectorAll('input[type="radio"]');
	// Read every affected value before a synchronous subscriber can project DOM.
	const edits: Array<readonly [(value: unknown) => void, boolean]> = [];
	for (let index = 0; index < group.length; index++) {
		const other = group[index] as HTMLInputElement;
		if (
			other.localName !== 'input' ||
			other.type !== 'radio' ||
			other.name !== input.name ||
			other.form !== input.form ||
			other.getRootNode() !== root
		)
			continue;
		const write = RADIO_WRITERS.get(other);
		if (write) edits.push([write, other.checked]);
	}
	// Unchecks first: publishing the selected member cannot revive its old cousin.
	for (const [write, checked] of edits) if (!checked) write(false);
	for (const [write, checked] of edits) if (checked) write(true);
}

export interface BindingControlPrepared {
	/** Publish captured native edits and switch input authority, without writing DOM. */
	publish(): void;
	/** Commit only a still-current, fully validated native value. */
	commit(): void;
}

export interface BindingControlPreview extends BindingControlPrepared {
	validate(): boolean;
	discard(): void;
}

export interface BindingControlLease {
	prepare(value: unknown): BindingControlPrepared;
	preview(value: unknown): BindingControlPreview;
	prepareCurrent(): BindingControlPrepared;
	active(): boolean;
	composing(): boolean;
	dispose(): void;
}

/** @internal Optional compiled-control capability; captures, but never creates, an owner. */
export function __createBindingControls(owner = currentSignalOwner()) {
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	return {
		claim(element: Element, channel: ControlChannel, notify: () => void): BindingControlLease {
			const control = element as SignalControl;
			if (
				control?.nodeType !== 1 ||
				(channel !== 'value' && channel !== 'checked') ||
				!['input', 'textarea', 'select'].includes(control.localName) ||
				(channel === 'checked' &&
					(control.localName !== 'input' || !['checkbox', 'radio'].includes(control.type))) ||
				(channel === 'value' && control.localName === 'input' && control.type === 'file')
			)
				throw new TypeError(
					'A signal control requires a native value/checked property and a signal.',
				);
			if (
				CONTROL_BINDINGS.get(control)?.has(channel) ||
				hasHydrationControlSignalWriter(control, channel)
			)
				throw new Error(
					'This control property already has a signal binding. Dispose it before rebinding.',
				);
			let channels = CONTROL_BINDINGS.get(control);
			if (!channels) CONTROL_BINDINGS.set(control, (channels = new Set()));
			channels.add(channel);
			let disposed = false;
			let initialized = false;
			let composing = false;
			let raw: unknown;
			let handle: SignalHandle<unknown> | undefined;
			let active: SignalHandle<unknown> | undefined;
			let unsubscribe: (() => void) | undefined;
			let stopWriter: (() => void) | undefined;
			let generation = 0;
			let revision = 0;
			const read = (value: SignalHandle<unknown>): unknown =>
				run(() => value[SIGNAL_BINDING_READ]());
			const write = (value: unknown): void => {
				if (disposed || !isWritableSignal(active)) return;
				const writable = active;
				// Target listeners run before delegated event urgency is established.
				withoutSignalCandidate(() =>
					run(() => {
						const previous = read(writable);
						if (
							Object.is(previous, value) ||
							(Array.isArray(previous) &&
								Array.isArray(value) &&
								previous.length === value.length &&
								previous.every((item, index) => item === value[index]))
						)
							return;
						writable.set(value);
					}),
				);
			};
			const nativeValue = (): unknown => {
				const snapshot = snapshotHydrationControl(control)!;
				return channel === 'checked'
					? snapshot.checked
					: (snapshot.selectedValues ?? snapshot.value);
			};
			const input = (): void => {
				if (disposed) return;
				if (
					channel === 'checked' &&
					control.type === 'radio' &&
					(control as HTMLInputElement).name !== ''
				)
					publishRadioInput(control as HTMLInputElement);
				else write(nativeValue());
			};
			const compositionStart = (): void => {
				// Native target events also cover editors behind a shadow boundary.
				composing = true;
			};
			const compositionEnd = (): void => {
				if (disposed) return;
				composing = false;
				input();
				if (!disposed) notify();
			};
			const dispose = (): void => {
				if (disposed) return;
				disposed = true;
				generation++;
				raw = undefined;
				active = handle = undefined;
				if (channel === 'checked') RADIO_WRITERS.delete(control);
				let failed = false;
				let failure: unknown;
				const attempt = (stop: (() => void) | undefined): void => {
					try {
						stop?.();
					} catch (error) {
						if (!failed) {
							failed = true;
							failure = error;
						}
					}
				};
				const stop = unsubscribe;
				unsubscribe = undefined;
				attempt(stop);
				attempt(stopWriter);
				stopWriter = undefined;
				control.removeEventListener('input', input);
				control.removeEventListener('compositionstart', compositionStart);
				control.removeEventListener('compositionend', compositionEnd);
				// Retain the claim through fallible/reentrant subscription cleanup.
				channels.delete(channel);
				if (channels.size === 0) CONTROL_BINDINGS.delete(control);
				if (failed) throw failure;
			};
			const prepare = (
				next: unknown,
				preview = false,
			): BindingControlPrepared | BindingControlPreview => {
				if (disposed) return { validate: () => false, discard() {}, publish() {}, commit() {} };
				if (
					isSignalHandle(next) &&
					(typeof next[SIGNAL_BINDING_READ] !== 'function' ||
						typeof next[SIGNAL_BINDING_SUBSCRIBE] !== 'function')
				)
					throw new TypeError(
						'A signal control requires a native value/checked property and a signal.',
					);
				if (!preview && raw !== next) {
					const ticket = ++generation;
					const stop = unsubscribe;
					unsubscribe = undefined;
					handle = undefined;
					stop?.();
					if (disposed) return { validate: () => false, discard() {}, publish() {}, commit() {} };
					raw = next;
					// Reads, subscriptions and writes run inside the captured owner;
					// a descriptor resolves itself without importing the graph here.
					handle = isSignalHandle(next) ? next : undefined;
					if (handle) {
						const candidate = handle;
						const stopNext = run(() =>
							candidate[SIGNAL_BINDING_SUBSCRIBE](
								forwardNativeTransitionConsumer(notify, () => {
									if (!disposed && generation === ticket) {
										revision++;
										notify();
									}
								}),
								() => {
									// The document may retire before application pagehide cleanup.
									// Do not read dead authority or release a replacement's lease.
									if (!disposed && generation === ticket) dispose();
								},
							),
						);
						if (typeof stopNext !== 'function')
							throw new TypeError('A signal control subscription must return cleanup.');
						if (disposed || generation !== ticket) stopNext();
						else unsubscribe = stopNext;
					}
				}
				if (disposed) return { validate: () => false, discard() {}, publish() {}, commit() {} };
				const candidate = preview ? (isSignalHandle(next) ? next : undefined) : handle;
				const value = candidate ? read(candidate) : next;
				if (disposed) return { validate: () => false, discard() {}, publish() {}, commit() {} };
				const multiple = control.localName === 'select' && (control as HTMLSelectElement).multiple;
				if (
					candidate &&
					(channel === 'checked'
						? typeof value !== 'boolean'
						: multiple
							? !Array.isArray(value)
							: typeof value !== 'string')
				)
					throw new TypeError(
						channel === 'checked'
							? 'A checked signal must contain a boolean.'
							: multiple
								? 'A multiple select signal must contain an array.'
								: 'A value signal must contain a string.',
					);
				let selected: Set<string> | undefined;
				if (multiple && Array.isArray(value)) {
					selected = new Set();
					for (const item of value) selected.add(candidate ? item : controlString(item));
				}
				const normalized =
					channel === 'checked' ? !!value : value == null || multiple ? '' : controlString(value);
				let ticket = generation;
				const version = revision;
				let accepted = !preview;
				let retired = false;
				let invalid = false;
				let staged =
					preview && candidate && candidate !== handle
						? run(() =>
								candidate[SIGNAL_BINDING_SUBSCRIBE](
									forwardNativeTransitionConsumer(notify, () => {
										if (retired || disposed) return;
										if (!accepted) invalid = true;
										else if (generation === ticket) {
											revision++;
											notify();
										}
									}),
									() => {
										if (!accepted) invalid = true;
										else if (!disposed && generation === ticket) dispose();
									},
								),
							)
						: undefined;
				const prepared: BindingControlPrepared = {
					publish(): void {
						if (retired || disposed || ticket !== generation) return;
						if (!accepted) {
							accepted = true;
							if (raw !== next) {
								const stop = unsubscribe;
								ticket = ++generation;
								raw = next;
								handle = candidate;
								unsubscribe = staged;
								staged = undefined;
								stop?.();
							}
						}
						active = candidate;
						if (isWritableSignal(active)) {
							// Document capture runs before the native target listener. Snapshot
							// radio cousins here, before any subscriber can project old state.
							stopWriter ??= registerHydrationControlSignalWriter(
								control,
								channel,
								channel === 'checked' && control.type === 'radio' ? input : write,
							);
							if (channel === 'checked' && control.type === 'radio')
								RADIO_WRITERS.set(control, write);
						} else {
							stopWriter?.();
							stopWriter = undefined;
							if (channel === 'checked') RADIO_WRITERS.delete(control);
						}
						if (initialized) return;
						initializeHydrationControlCapture(control.ownerDocument);
						control.addEventListener('input', input);
						control.addEventListener('compositionstart', compositionStart);
						control.addEventListener('compositionend', compositionEnd);
						initialized = true;
						if (!isWritableSignal(active)) return;
						// Publish every newer reentrant edit before allowing a signal value
						// to become authoritative. Replacements never replay old edits.
						let snapshot;
						do {
							snapshot = snapshotHydrationControl(control)!;
							if (snapshot.editRevision > 0 && isWritableSignal(active)) write(nativeValue());
							if (disposed) return;
						} while (!consumeHydrationControl(control, snapshot.revision));
					},
					commit(): void {
						if (
							retired ||
							disposed ||
							value == null ||
							(multiple && selected === undefined) ||
							ticket !== generation ||
							version !== revision ||
							active !== candidate ||
							composing ||
							snapshotHydrationControl(control)!.composing
						)
							return;
						if (channel === 'checked') {
							if ((control as HTMLInputElement).checked !== normalized)
								(control as HTMLInputElement).checked = normalized as boolean;
						} else if (selected) {
							for (const option of (control as HTMLSelectElement).options) {
								if (disposed) return;
								const next = selected.has(option.value);
								if (option.selected !== next) option.selected = next;
							}
						} else if (
							!candidate && control.localName === 'input' && control.type === 'number'
								? // Preserve a user's "1.0" for sampled numeric 1, but show zero over an empty edit.
									(value === 0 && control.value === '') || control.value != (value as any)
								: control.value !== normalized
						)
							control.value = normalized as string;
					},
				};
				return preview
					? Object.assign(prepared, {
							validate: () =>
								!retired && !invalid && !disposed && ticket === generation && version === revision,
							discard() {
								if (accepted || retired) return;
								retired = true;
								staged?.();
								staged = undefined;
							},
						})
					: prepared;
			};
			return {
				prepare,
				preview: (value) => prepare(value, true) as BindingControlPreview,
				prepareCurrent: () => prepare(raw),
				active: () => !disposed,
				composing: () => composing,
				dispose,
			};
		},
	};
}

function controlSignalOwner(owner: SignalOwner | null, document: boolean): object | null {
	return owner !== null && 'documentOwner' in owner
		? document
			? owner.documentOwner
			: owner.instanceOwner
		: owner;
}

/**
 * Bind one native property on externally owned DOM without creating a renderer.
 * Writable signals adopt captured early edits and receive native input; other
 * handles only project. The callable cleanup may be offered to hydrateRoot in
 * controlLeases; declined or suspended presentation keeps this binding active.
 */
export function bindSignalControl(
	control: SignalControl,
	channel: 'value',
	handle$: SignalHandle<string | readonly string[]>,
): SignalControlBinding;
export function bindSignalControl(
	control: HTMLInputElement,
	channel: 'checked',
	handle$: SignalHandle<boolean>,
): SignalControlBinding;
export function bindSignalControl(
	control: SignalControl,
	channel: ControlChannel,
	handle$: SignalHandle<unknown>,
): SignalControlBinding {
	if (!isSignalHandle(handle$))
		throw new TypeError('A signal control requires a native value/checked property and a signal.');
	let busy = false;
	let dirty = false;
	let disposed = false;
	let lease: BindingControlLease;
	let handoff: ControlHandoff | undefined;
	const dispose = (): void => {
		disposed = true;
		lease.dispose();
	};
	const refresh: NativeTransitionNotify = (): void => {
		if (disposed) return;
		dirty = true;
		if (busy) return;
		busy = true;
		try {
			while (dirty && !disposed) {
				dirty = false;
				const prepared = lease.prepare(handle$);
				prepared.publish();
				if (!dirty && !disposed) prepared.commit();
			}
		} catch (error) {
			try {
				dispose();
			} catch {
				/* Preserve the failed projection. */
			}
			throw error;
		} finally {
			busy = false;
		}
	};
	refresh[NATIVE_TRANSITION_CONSUMER] = {
		active: () => !disposed,
		prepare: () => {
			const prepared = lease.preview(handle$);
			return {
				validate: () => !disposed && !busy && prepared.validate(),
				discard: prepared.discard,
				commit() {
					if (!disposed) {
						busy = true;
						try {
							prepared.publish();
							prepared.commit();
						} finally {
							busy = false;
						}
					}
				},
			};
		},
	};
	const owner = currentSignalOwner();
	lease = __createBindingControls(owner).claim(control, channel, refresh);
	refresh();
	return Object.assign(dispose, {
		[CONTROL_HANDOFF](): ControlHandoff {
			return (handoff ??= {
				control,
				channel,
				active: () => !disposed && lease.active(),
				matches(handle) {
					if (disposed || !lease.active() || handle !== handle$) return false;
					// Concrete handles already carry their owner. A module descriptor
					// can resolve the same authored key to a different cell in another
					// document or instance; equal names never grant that authority.
					if (!(SIGNAL_OWNER_RESOLVE in handle$)) return true;
					const document = handle$[SIGNAL_BINDING_IDENTITY]().scope === 'document';
					return (
						owner !== null &&
						controlSignalOwner(owner, document) ===
							controlSignalOwner(currentSignalOwner(), document) &&
						!disposed &&
						lease.active()
					);
				},
				composing: lease.composing,
				// dispose revokes authority before invoking fallible subscription
				// cleanup; a later call cannot release the renderer's replacement.
				retire: dispose,
			});
		},
	});
}
