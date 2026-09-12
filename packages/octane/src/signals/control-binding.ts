import {
	initializeHydrationEventCapture,
	snapshotHydrationControl,
} from '../hydration/event-capture.js';
import {
	hasHydrationControlSignalWriter,
	registerHydrationControlSignalWriter,
} from './early-values.js';
import { isSignalHandle, isWritableSignal, resolveSignalHandleForOwner } from './facade.js';
import { captureSignalOwner, currentSignalOwner } from './owner-context.js';
import { SIGNAL_OWNER_RESOLVE, type SignalHandle } from './types.js';

type SignalControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const CONTROL_BINDINGS = /* @__PURE__ */ new WeakMap<SignalControl, Set<'value' | 'checked'>>();

/**
 * Bind one native property on externally owned DOM without creating a renderer.
 * Writable signals adopt captured early edits and receive native input; other
 * handles only project. The caller must dispose before replacing the control or
 * transferring its property to another owner. No event default is canceled.
 */
export function bindSignalControl(
	control: SignalControl,
	channel: 'value',
	handle$: SignalHandle<string | readonly string[]>,
): () => void;
export function bindSignalControl(
	control: HTMLInputElement,
	channel: 'checked',
	handle$: SignalHandle<boolean>,
): () => void;

export function bindSignalControl(
	control: SignalControl,
	channel: 'value' | 'checked',
	handle$: SignalHandle<unknown>,
): () => void {
	if (
		control?.nodeType !== 1 ||
		(channel !== 'value' && channel !== 'checked') ||
		!['input', 'textarea', 'select'].includes(control.localName) ||
		(channel === 'checked' &&
			(control.localName !== 'input' || !['checkbox', 'radio'].includes(control.type))) ||
		(channel === 'value' && control.localName === 'input' && control.type === 'file') ||
		!isSignalHandle(handle$)
	) {
		throw new TypeError('A signal control requires a native value/checked property and a signal.');
	}
	if (
		CONTROL_BINDINGS.get(control)?.has(channel) ||
		hasHydrationControlSignalWriter(control, channel)
	)
		throw new Error(
			'This control property already has a signal binding. Dispose it before rebinding.',
		);
	initializeHydrationEventCapture(control.ownerDocument);
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	const handle =
		owner !== null && SIGNAL_OWNER_RESOLVE in handle$
			? resolveSignalHandleForOwner(handle$, owner)
			: handle$;
	const writable = isWritableSignal(handle) ? handle : null;
	let channels = CONTROL_BINDINGS.get(control);
	if (channels === undefined) CONTROL_BINDINGS.set(control, (channels = new Set()));
	channels.add(channel);
	let disposed = false;
	let stopWriter: (() => void) | undefined;
	let unsubscribe: (() => void) | undefined;
	const project = (): void => {
		if (disposed) return;
		const value = run(() => handle.get());
		if (snapshotHydrationControl(control)!.composing) return;
		if (channel === 'checked') {
			if (typeof value !== 'boolean')
				throw new TypeError('A checked signal must contain a boolean.');
			if ((control as HTMLInputElement).checked !== value)
				(control as HTMLInputElement).checked = value;
		} else if (control.localName === 'select' && (control as HTMLSelectElement).multiple) {
			if (!Array.isArray(value))
				throw new TypeError('A multiple select signal must contain an array.');
			const selected = new Set(value);
			for (const option of (control as HTMLSelectElement).options) {
				const next = selected.has(option.value);
				if (option.selected !== next) option.selected = next;
			}
		} else {
			if (typeof value !== 'string') throw new TypeError('A value signal must contain a string.');
			// Reassigning an unchanged text value can reset selection in native engines.
			if (control.value !== value) control.value = value;
		}
	};
	const write = (value: unknown): void => {
		if (disposed || writable === null) return;
		run(() => {
			const previous = writable.get();
			if (
				Object.is(previous, value) ||
				(Array.isArray(previous) &&
					Array.isArray(value) &&
					previous.length === value.length &&
					previous.every((item, index) => item === value[index]))
			)
				return;
			writable.set(value);
		});
	};
	const readControl = (): unknown => {
		const snapshot = snapshotHydrationControl(control)!;
		return channel === 'checked' ? snapshot.checked : (snapshot.selectedValues ?? snapshot.value);
	};
	const commit = (): void => write(readControl());
	const finishComposition = (): void => {
		commit();
		project();
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		channels.delete(channel);
		if (channels.size === 0) CONTROL_BINDINGS.delete(control);
		stopWriter?.();
		unsubscribe?.();
		control.removeEventListener('compositionend', finishComposition);
	};
	try {
		if (writable !== null) {
			stopWriter = registerHydrationControlSignalWriter(control, channel, write);
			if (snapshotHydrationControl(control)!.editRevision > 0) commit();
		}
		control.addEventListener('compositionend', finishComposition);
		// Initial pending/error reads fail without leaving a writer or subscription.
		project();
		unsubscribe = run(() => handle.subscribe(project));
		return dispose;
	} catch (error) {
		dispose();
		throw error;
	}
}
