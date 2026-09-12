import { formatClientError } from '../error-codes.client.generated.js';
import { registerSignalOwnerDocument } from './early-values.js';
import { installDefaultSignalOwner } from './owner-context.js';
import type { SignalOwner, SignalOwnerIdentity } from './types.js';

const documentOwners = /* @__PURE__ */ new WeakMap<Document, SignalOwnerIdentity>();
let defaultInstalled = false;
export let streamedSignalOwnerActivator: ((owner: SignalOwner) => void) | undefined;

/** @internal Shared document identity for state-only and component consumers. */
export function documentSignalOwner(container: Node): SignalOwnerIdentity {
	const ownerDocument =
		container.nodeType === 9 ? (container as Document) : container.ownerDocument;
	if (ownerDocument === null) throw new TypeError('A signal document owner requires a document.');
	let owner = documentOwners.get(ownerDocument);
	if (owner === undefined) {
		owner = Object.freeze({ scopeKey: 'octane:document' });
		documentOwners.set(ownerDocument, owner);
	}
	registerSignalOwnerDocument(owner, ownerDocument);
	return owner;
}

/** @internal Compiler capability for global signals without a rendering engine. */
export function enableSignalDocument(abi = 1): void {
	if (abi !== 1) throw new TypeError(formatClientError(65));
	if (defaultInstalled) return;
	defaultInstalled = true;
	installDefaultSignalOwner(() =>
		typeof document === 'undefined' ? null : documentSignalOwner(document),
	);
}

/** @internal Instance activation is optional; global results need no component root. */
export function installStreamedSignalOwnerActivator(
	activate: (owner: SignalOwner) => void,
): () => void {
	if (streamedSignalOwnerActivator !== undefined) {
		throw new Error('A streamed signal hydration owner is already installed.');
	}
	streamedSignalOwnerActivator = activate;
	return () => {
		if (streamedSignalOwnerActivator === activate) streamedSignalOwnerActivator = undefined;
	};
}
