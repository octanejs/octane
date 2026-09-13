import {
	documentSignalOwner,
	enableSignalDocument,
	installStreamedSignalOwnerActivator,
} from '../signals/document-owner.js';
import { attachStreamedSignalResult, initializeDocumentSignalOwner } from '../signals/facade.js';
import { registerSignalOwnerDocument } from '../signals/early-values.js';
import { retireSignalOwnerIdentity } from '../signals/owner-context.js';
import {
	parseNativeSignalManifest,
	type NativeSignalManifest,
} from '../signals/native-read-seeds.js';
export type { NativeSignalManifest } from '../signals/native-read-seeds.js';
import type {
	SignalOwner,
	SignalOwnerIdentity,
	SignalRendererOwnerIdentity,
} from '../signals/types.js';
import {
	isStreamFrameIdentity,
	isStreamedRendererFrame,
	streamFrameIdentityKey,
	type StreamFrameIdentity,
} from '../streamed-signals-protocol.js';
import {
	installStreamedRendererGlobal,
	type StreamedRendererDeliveryOptions,
} from './stream-delivery.js';
import { createStreamedRegionReceiver, type StreamedRegionReceiver } from './stream-receiver.js';
export {
	installSignalDocumentLifecycle,
	type SignalDocumentLifecycleOptions,
} from './document-lifecycle.js';

const STREAMED_SIGNAL_SELECTIONS = '__octaneStreamedSignalSelections';

interface EarlyStreamedSignalSelections {
	readonly version: 1;
	readonly identities: unknown[];
	readonly overflow?: boolean;
	register(identity: unknown): void;
}

interface EarlyStreamedRenderer {
	readonly version: 1;
	readonly frames: unknown[];
	receive(frame: unknown): void;
}

export interface StreamedSignalHydrationOptions extends StreamedRendererDeliveryOptions {
	readonly buildId: string;
	readonly documentId: string;
	/** Custom authority; pass it to hydrateRoot or use runWithSignalOwner in behavior callbacks. */
	readonly signalOwner?: SignalOwnerIdentity;
	/**
	 * Initial-response data only. Install once, before live signal access or stream
	 * attachment. Only the document scope is initialized; instance snapshots stay
	 * historical. A failed join retires newly initialized authority rather than
	 * rolling state back. The caller supplies the matching build/document identity.
	 */
	readonly initialSignals?: NativeSignalManifest;
	readonly target?: Record<string, unknown>;
}

export interface StreamedSignalHydration {
	readonly signalOwner: SignalOwnerIdentity;
	readonly receiver: StreamedRegionReceiver;
	dispose(): void;
	/** Permanently fence this document's old ingress without restoring its early mailbox. */
	suspend(): void;
}

function documentOwner(owner: SignalOwner): SignalOwnerIdentity {
	return 'documentOwner' in owner ? owner.documentOwner : owner;
}

/**
 * Upgrade the server's pre-module mailboxes before behavior reads or hydration.
 * No component root is required. An optional hydrateRoot receives the returned
 * owner so its instance-local descriptors join the same server-authorized
 * selections without starting duplicate browser loaders.
 */
export function bootstrapStreamedSignalHydration(
	options: StreamedSignalHydrationOptions,
): StreamedSignalHydration {
	if (!options.buildId || !options.documentId) {
		throw new TypeError('Streamed signal hydration requires buildId and documentId.');
	}
	const target = options.target ?? (globalThis as Record<string, unknown>);
	const signalOwner = options.signalOwner ?? documentSignalOwner(document);
	const receiver = createStreamedRegionReceiver({
		buildId: options.buildId,
		documentId: options.documentId,
		ownerKey: signalOwner.scopeKey,
		...(options.maxPendingFrames === undefined
			? {}
			: { maxPendingFrames: options.maxPendingFrames }),
		...(options.maxPendingBytes === undefined ? {} : { maxPendingBytes: options.maxPendingBytes }),
		...(options.timeoutMs === undefined ? {} : { pendingTimeoutMs: options.timeoutMs }),
	});
	const early = target[STREAMED_SIGNAL_SELECTIONS] as EarlyStreamedSignalSelections | undefined;
	if (
		early === undefined ||
		early === null ||
		typeof early !== 'object' ||
		early.version !== 1 ||
		!Array.isArray(early.identities) ||
		typeof early.register !== 'function'
	) {
		receiver.dispose();
		throw new Error('The streamed signal selection bootstrap is missing or incompatible.');
	}
	if (early.overflow === true) {
		receiver.dispose();
		throw new Error('The pre-module streamed signal selection mailbox overflowed.');
	}
	const selections = new Map<string, { identity: StreamFrameIdentity; detach?: () => void }>();
	const owners = new Map<string, SignalRendererOwnerIdentity>();
	let disposed = false;
	const attach = (
		selection: { identity: StreamFrameIdentity; detach?: () => void },
		owner: SignalRendererOwnerIdentity,
	): void => {
		if (selection.detach !== undefined || selection.identity.instanceKey !== owner.instanceKey)
			return;
		selection.detach = attachStreamedSignalResult(receiver, owner, selection.identity);
	};
	const register = (candidate: unknown): void => {
		if (disposed) return;
		if (
			!isStreamFrameIdentity(candidate) ||
			candidate.buildId !== options.buildId ||
			candidate.documentId !== options.documentId ||
			candidate.ownerKey !== signalOwner.scopeKey
		) {
			throw new Error('A streamed signal selection has the wrong authority.');
		}
		const slot = JSON.stringify([candidate.instanceKey, candidate.nodeKey]);
		const previous = selections.get(slot);
		previous?.detach?.();
		receiver.registerSelection(candidate);
		const selection = { identity: candidate };
		selections.set(slot, selection);
		const owner = owners.get(candidate.instanceKey);
		if (owner !== undefined) attach(selection, owner);
		else if (candidate.nodeKey.startsWith('g:')) {
			// A global descriptor belongs to the document cell even though the wire
			// retains the exact renderer instance that selected this attempt. Join it
			// before any root exists; an i: descriptor still waits for its real scope.
			attach(selection, {
				scopeKey: signalOwner.scopeKey,
				documentOwner: signalOwner,
				instanceOwner: signalOwner,
				instanceKey: candidate.instanceKey,
			});
		}
	};
	const originalRegister = early.register;
	let uninstallOwnerActivator: (() => void) | undefined;
	let initialized = false;
	try {
		// Reserve the single document bridge before initializing state or touching
		// mailboxes. A duplicate bootstrap must leave the active document alone.
		uninstallOwnerActivator = installStreamedSignalOwnerActivator((owner) => {
			if (disposed || !('documentOwner' in owner) || documentOwner(owner) !== signalOwner) return;
			if (owners.has(owner.instanceKey)) return;
			owners.set(owner.instanceKey, owner);
			for (const selection of selections.values()) attach(selection, owner);
		});
		if (options.initialSignals !== undefined) {
			const manifest = parseNativeSignalManifest(JSON.stringify(options.initialSignals));
			initializeDocumentSignalOwner(
				signalOwner,
				manifest.scopes.find((scope) => scope.scopeKey === signalOwner.scopeKey) ?? {
					version: 1,
					scopeKey: signalOwner.scopeKey,
					entries: [],
				},
			);
			initialized = true;
		}
		registerSignalOwnerDocument(signalOwner, document);
		enableSignalDocument();
		early.register = register;
		for (const identity of early.identities) register(identity);
		early.identities.length = 0;
	} catch (error) {
		uninstallOwnerActivator?.();
		if (early.register === register) early.register = originalRegister;
		for (const selection of selections.values()) selection.detach?.();
		receiver.dispose();
		// Never retain partially initialized document state after a failed join.
		// Its authority is retired rather than rolling live data backward.
		if (initialized) retireSignalOwnerIdentity(signalOwner);
		throw error;
	}
	// Result calls that beat module evaluation must be in the engine mailbox
	// before a synchronous hydrateRoot read can consider starting its loader.
	// Placement stays on the normal async delivery path because its DOM range and
	// styles may not be registered yet.
	const earlyRenderer = target.__octaneStreamedRenderer as EarlyStreamedRenderer | undefined;
	if (
		earlyRenderer !== undefined &&
		earlyRenderer !== null &&
		typeof earlyRenderer === 'object' &&
		earlyRenderer.version === 1 &&
		Array.isArray(earlyRenderer.frames)
	) {
		const current = new Set(
			[...selections.values()].map(({ identity }) => streamFrameIdentityKey(identity)),
		);
		let retained = 0;
		for (const frame of earlyRenderer.frames) {
			if (
				isStreamedRendererFrame(frame) &&
				frame.channel === 'result' &&
				current.has(streamFrameIdentityKey(frame.identity))
			) {
				void receiver.receive(frame).catch(() => {});
			} else {
				earlyRenderer.frames[retained++] = frame;
			}
		}
		earlyRenderer.frames.length = retained;
	}
	let uninstallDelivery: () => void;
	try {
		uninstallDelivery = installStreamedRendererGlobal(receiver, target, options);
	} catch (error) {
		uninstallOwnerActivator();
		early.register = originalRegister;
		for (const selection of selections.values()) selection.detach?.();
		receiver.dispose();
		if (initialized) retireSignalOwnerIdentity(signalOwner);
		throw error;
	}
	const installedRenderer = target.__octaneStreamedRenderer;
	const close = (restore: boolean): void => {
		if (disposed) return;
		disposed = true;
		if (early.register === register) early.register = restore ? originalRegister : () => {};
		uninstallOwnerActivator();
		for (const selection of selections.values()) selection.detach?.();
		const ownsIngress = target.__octaneStreamedRenderer === installedRenderer;
		uninstallDelivery();
		if (!restore && ownsIngress) {
			// Uninstall restores the pre-module descriptor. Do not allow late
			// parser calls to refill that mailbox after a BFCache freeze.
			target.__octaneStreamedRenderer = { receive() {} };
			if (earlyRenderer) earlyRenderer.frames.length = 0;
		}
		selections.clear();
		owners.clear();
		receiver.dispose();
	};
	return {
		signalOwner,
		receiver,
		dispose() {
			close(true);
		},
		suspend() {
			close(false);
		},
	};
}
