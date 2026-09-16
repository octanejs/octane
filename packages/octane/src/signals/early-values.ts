import { SIGNAL_CONTROL_ATTR } from '../hydration-markers.js';
import type { SignalBindingIdentity, SignalOwner, SignalRendererOwnerIdentity } from './types.js';

type ControlChannel = 'value' | 'checked';
type EarlyValue = { revision: number; value: unknown };
type ControlWriter = (value: unknown) => void;
type SerializedControlBinding = readonly [
	instanceKey: string,
	nodeKey: string,
	channel: ControlChannel,
];

const OWNER_DOCUMENTS = /* @__PURE__ */ new WeakMap<object, Document>();
const DOCUMENT_VALUES = /* @__PURE__ */ new WeakMap<Document, Map<string, EarlyValue>>();
const CONTROL_WRITERS = /* @__PURE__ */ new WeakMap<Element, Map<ControlChannel, ControlWriter>>();
const EARLY_CONTROL_REVISIONS = /* @__PURE__ */ new WeakMap<Element, number>();
const CLAIMED_CONTROL_DOCUMENTS = /* @__PURE__ */ new WeakSet<Document>();

interface EarlyControlMailbox {
	q: Array<readonly [Element, number]>;
	p?: (control: Element, revision: number) => void;
}

function rendererOwner(owner: SignalOwner): owner is SignalRendererOwnerIdentity {
	return typeof owner === 'object' && owner !== null && 'documentOwner' in owner;
}

function ownerObject(owner: SignalOwner): object {
	return rendererOwner(owner) ? owner.instanceOwner : owner;
}

function valueKey(ownerKey: string, instanceKey: string, nodeKey: string): string {
	return JSON.stringify([ownerKey, instanceKey, nodeKey]);
}

/** @internal Associate an engine-free signal owner with its browser document. */
export function registerSignalOwnerDocument(owner: SignalOwner, ownerDocument: Document): void {
	OWNER_DOCUMENTS.set(ownerObject(owner), ownerDocument);
	if (rendererOwner(owner)) OWNER_DOCUMENTS.set(owner.documentOwner, ownerDocument);
}

function documentForOwner(owner: SignalOwner): Document | undefined {
	return OWNER_DOCUMENTS.get(ownerObject(owner));
}

function bindingKey(owner: SignalOwner, binding: SignalBindingIdentity): string {
	const ownerKey = rendererOwner(owner) ? owner.documentOwner.scopeKey : owner.scopeKey;
	const instanceKey = binding.scope === 'instance' && rendererOwner(owner) ? owner.instanceKey : '';
	return valueKey(ownerKey, instanceKey, binding.nodeKey);
}

/** @internal Read the last pre-activation edit before creating a writable cell. */
export function readEarlySignalValue(
	owner: SignalOwner,
	binding: SignalBindingIdentity,
): EarlyValue | undefined {
	const ownerDocument = documentForOwner(owner);
	return ownerDocument === undefined
		? undefined
		: DOCUMENT_VALUES.get(ownerDocument)?.get(bindingKey(owner, binding));
}

function parseControlBindings(control: Element): {
	ownerKey: string;
	bindings: readonly SerializedControlBinding[];
} | null {
	const raw = control.getAttribute(SIGNAL_CONTROL_ATTR);
	if (raw === null) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed) || parsed.length !== 3 || parsed[0] !== 1) return null;
		if (typeof parsed[1] !== 'string' || !Array.isArray(parsed[2])) return null;
		const bindings: SerializedControlBinding[] = [];
		for (const entry of parsed[2]) {
			if (
				!Array.isArray(entry) ||
				entry.length !== 3 ||
				typeof entry[0] !== 'string' ||
				typeof entry[1] !== 'string' ||
				(entry[2] !== 'value' && entry[2] !== 'checked')
			) {
				return null;
			}
			bindings.push(entry as unknown as SerializedControlBinding);
		}
		return { ownerKey: parsed[1], bindings };
	} catch {
		return null;
	}
}

function controlValue(control: Element, channel: ControlChannel): unknown {
	if (channel === 'checked') return (control as HTMLInputElement).checked;
	if (control.localName === 'select' && (control as HTMLSelectElement).multiple) {
		return Array.from((control as HTMLSelectElement).selectedOptions, (option) => option.value);
	}
	return (control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}

/** @internal Publish a native edit into both the pre-module buffer and any live binding. */
export function publishHydrationControlSignalValues(control: Element, revision: number): void {
	const metadata = parseControlBindings(control);
	if (metadata !== null) {
		let values = DOCUMENT_VALUES.get(control.ownerDocument);
		if (values === undefined) DOCUMENT_VALUES.set(control.ownerDocument, (values = new Map()));
		for (const [instanceKey, nodeKey, channel] of metadata.bindings) {
			const key = valueKey(metadata.ownerKey, instanceKey, nodeKey);
			const previous = values.get(key);
			// Queue entries use one inline clock but can drain out of order after
			// coalescing. Live module events are already ordered; their per-control
			// clocks must not reject a later edit from another control of this cell.
			if (
				CLAIMED_CONTROL_DOCUMENTS.has(control.ownerDocument) ||
				previous === undefined ||
				revision >= previous.revision
			) {
				values.set(key, { revision, value: controlValue(control, channel) });
			}
		}
	}
	const writers = CONTROL_WRITERS.get(control);
	if (writers !== undefined) {
		for (const [channel, write] of writers) write(controlValue(control, channel));
	}
}

/** @internal Let candidate application update the already-live writable cell directly. */
export function registerHydrationControlSignalWriter(
	control: Element,
	channel: ControlChannel,
	write: ControlWriter,
): () => void {
	let writers = CONTROL_WRITERS.get(control);
	if (writers === undefined) CONTROL_WRITERS.set(control, (writers = new Map()));
	writers.set(channel, write);
	return () => {
		if (writers!.get(channel) !== write) return;
		writers!.delete(channel);
		if (writers!.size === 0) CONTROL_WRITERS.delete(control);
	};
}

/** @internal A writable binding already provides this control's native input handler. */
export function hasHydrationControlSignalWriter(
	control: Element,
	channel: ControlChannel,
): boolean {
	return CONTROL_WRITERS.get(control)?.has(channel) ?? false;
}

/** @internal Carry edit authority across module handoff, even after editing back to SSR. */
export function readEarlyHydrationControlRevision(control: Element): number {
	return EARLY_CONTROL_REVISIONS.get(control) ?? 0;
}

/** @internal Retire the imported revision only after exact control-state adoption. */
export function clearEarlyHydrationControlRevision(control: Element): void {
	EARLY_CONTROL_REVISIONS.delete(control);
}

/** @internal Module capture replaces the inline writer for this document. */
export function claimEarlyHydrationControlCapture(ownerDocument: Document): void {
	CLAIMED_CONTROL_DOCUMENTS.add(ownerDocument);
}

function publishEarlyHydrationControlSignalValues(control: Element, revision: number): void {
	// The inline listener remains in the document, but only one capture layer
	// publishes after handoff. Module revisions then advance from the imported edit.
	if (CLAIMED_CONTROL_DOCUMENTS.has(control.ownerDocument)) return;
	EARLY_CONTROL_REVISIONS.set(control, revision);
	publishHydrationControlSignalValues(control, revision);
}

// A streaming shell can capture native input before the client module evaluates.
// Claim its bounded element queue as soon as this engine-free bridge loads.
if (typeof globalThis !== 'undefined') {
	const host = globalThis as typeof globalThis & {
		__octaneEarlySignalControls?: EarlyControlMailbox;
		__octanePublishSignalControl?: (control: Element, revision: number) => void;
	};
	host.__octanePublishSignalControl = publishEarlyHydrationControlSignalValues;
	const mailbox = host.__octaneEarlySignalControls;
	if (mailbox !== undefined) {
		mailbox.p = publishEarlyHydrationControlSignalValues;
		const queued = mailbox.q.splice(0);
		for (const [control, revision] of queued) {
			publishEarlyHydrationControlSignalValues(control, revision);
		}
	}
}
