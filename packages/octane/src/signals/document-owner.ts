import { formatClientError } from '../error-codes.client.generated.js';
import { associateSignalOwnerDocument } from './early-values.js';
import {
	enterSynchronousSignalOwner,
	installDefaultSignalOwner,
	restoreSynchronousSignalOwner,
} from './owner-context.js';
import type { SignalOwner, SignalOwnerIdentity } from './types.js';

const documentOwners = /* @__PURE__ */ new WeakMap<Document, SignalOwnerIdentity>();
let defaultInstalled = false;
/** @internal Actual document capability, shared with an optional renderer. */
export let signalDocumentEnabled = false;
export let streamedSignalOwnerActivator: ((owner: SignalOwner) => void) | undefined;
/**
 * @internal Lets a renderer enter each Block's owner in place rather than
 * through a callback frame. The document capability installs it, so renderers
 * that never enable signals do not retain it.
 */
export let signalOwnerFrame:
	| { enter: typeof enterSynchronousSignalOwner; restore: typeof restoreSynchronousSignalOwner }
	| undefined;

/** @internal Shared document identity for state-only and component consumers. */
export function documentSignalOwner(container: Node): SignalOwnerIdentity {
	const ownerDocument =
		container.nodeType === 9 ? (container as Document) : container.ownerDocument;
	if (ownerDocument === null) throw new TypeError(formatClientError(123));
	let owner = documentOwners.get(ownerDocument);
	if (owner === undefined) {
		owner = Object.freeze({ scopeKey: 'octane:document' });
		documentOwners.set(ownerDocument, owner);
	}
	associateSignalOwnerDocument(owner, ownerDocument);
	return owner;
}

/** @internal Compiler capability for global signals without a rendering engine. */
export function enableSignalDocument(abi = 1): void {
	if (abi !== 1) throw new TypeError(formatClientError(74));
	signalDocumentEnabled = true;
	if (defaultInstalled) return;
	defaultInstalled = true;
	signalOwnerFrame = { enter: enterSynchronousSignalOwner, restore: restoreSynchronousSignalOwner };
	installDefaultSignalOwner(() =>
		typeof document === 'undefined' ? null : documentSignalOwner(document),
	);
}

/** @internal Instance activation is optional; global results need no component root. */
export function installStreamedSignalOwnerActivator(
	activate: (owner: SignalOwner) => void,
): () => void {
	if (streamedSignalOwnerActivator !== undefined) {
		throw new Error(formatClientError(124));
	}
	streamedSignalOwnerActivator = activate;
	return () => {
		if (streamedSignalOwnerActivator === activate) streamedSignalOwnerActivator = undefined;
	};
}
