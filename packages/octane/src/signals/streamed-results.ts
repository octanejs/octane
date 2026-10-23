import { SignalStreamError } from './errors.js';
import { ScopeImpl } from './engine.js';
import {
	existingIdentityScope,
	isRendererOwner,
	isScope,
	resolveDescriptorOwner,
	retiredIdentities,
} from './facade.js';
import { assertAlive } from './graph.js';
import {
	isScopeStreamPending,
	retainCompletedScopeStream,
	scopeStreams,
	whenScopeStreamReady,
} from './scope-streams.js';
import type { OwnerScope, SignalOwner } from './types.js';
import type {
	StreamFrameIdentity,
	StreamedSignalResultFrame,
} from '../streamed-signals-protocol.js';

// Streamed results reach the engine only through this module, so an application
// whose only streamed path is a lazily loaded hydration receiver keeps the
// stream and request machinery in that receiver's chunk instead of the one that
// declares signals.

function streamedScope(
	owner: SignalOwner,
	identity: StreamFrameIdentity,
	create: boolean,
): OwnerScope | undefined {
	if (isScope(owner)) {
		return !owner.retired && identity.ownerKey === owner.scopeKey ? owner : undefined;
	}
	if (!isRendererOwner(owner)) return;
	if (
		identity.ownerKey !== owner.documentOwner.scopeKey ||
		identity.instanceKey !== owner.instanceKey ||
		(!identity.nodeKey.startsWith('g:') && !identity.nodeKey.startsWith('i:'))
	) {
		return;
	}
	const documentRetired = isScope(owner.documentOwner)
		? owner.documentOwner.retired
		: retiredIdentities.has(owner.documentOwner);
	if (documentRetired || retiredIdentities.has(owner.instanceOwner)) return;
	const target: SignalOwner = identity.nodeKey.startsWith('g:') ? owner.documentOwner : owner;
	if (create) return resolveDescriptorOwner(identity.nodeKey, target);
	if (isScope(target)) return target.retired ? undefined : target;
	return existingIdentityScope(isRendererOwner(target) ? target.instanceOwner : target);
}

/**
 * Bind receiver-owned selection authority before result delivery.
 * This is the only ingress that creates a scope's stream capability.
 */
function bindScopeStreamedSelection(owner: OwnerScope, identity: StreamFrameIdentity): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	const node = owner.nodes.get(identity.nodeKey);
	if (node && node.kind !== 'async') return false;
	return scopeStreams(owner).bind(identity, node);
}

/** Publish a receiver-validated result into an exact current request. */
function acceptScopeStreamedResult(owner: OwnerScope, frame: StreamedSignalResultFrame): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	// Without a bound selection there is no request this frame could belong to.
	return owner.streams?.accept(frame) ?? false;
}

/** Fail one exact streamed attempt after receiver timeout or rejection. */
function failScopeStreamedResult(
	owner: OwnerScope,
	identity: StreamFrameIdentity,
	error: Error,
): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	return owner.streams?.fail(identity, error) ?? false;
}

/** Bind receiver-owned selection authority, optionally before the query descriptor resolves. */
export function bindStreamedSignalSelection(
	owner: SignalOwner,
	identity: StreamFrameIdentity,
): boolean {
	const scope = streamedScope(owner, identity, true);
	return scope ? bindScopeStreamedSelection(scope, identity) : false;
}

/** Accept one already-validated result frame without reviving a retired owner. */
export function acceptStreamedSignalResult(
	owner: SignalOwner,
	frame: StreamedSignalResultFrame,
): boolean {
	const scope = streamedScope(owner, frame.identity, false);
	return scope ? acceptScopeStreamedResult(scope, frame) : false;
}

/** Fail one exact result channel without exposing an untrusted remote stack. */
export function failStreamedSignalResult(
	owner: SignalOwner,
	identity: StreamFrameIdentity,
	code: string,
): boolean {
	const scope = streamedScope(owner, identity, false);
	return scope ? failScopeStreamedResult(scope, identity, new SignalStreamError(code)) : false;
}

interface StreamedSignalReceiver {
	attachResult(
		identity: StreamFrameIdentity,
		consumer: {
			accept(frame: StreamedSignalResultFrame): void | false;
			retainCompleted?(frames: StreamedSignalResultFrame[]): boolean;
			fail(error: any): void;
		},
	): () => void;
}

function receiverErrorCode(error: unknown): string {
	if (
		error &&
		(typeof error === 'object' || typeof error === 'function') &&
		typeof (error as { code?: unknown }).code === 'string'
	) {
		return (error as { code: string }).code;
	}
	return 'receiver';
}

/** Connect a neutral early receiver to the signals engine without a hydration dependency. */
export function attachStreamedSignalResult(
	receiver: StreamedSignalReceiver,
	owner: SignalOwner,
	identity: StreamFrameIdentity,
): () => void {
	const scope = streamedScope(owner, identity, true);
	if (!(scope instanceof ScopeImpl) || !bindScopeStreamedSelection(scope, identity))
		throw new SignalStreamError('identity');
	const streams = scopeStreams(scope);
	const fail = (error: unknown): void => {
		failStreamedSignalResult(owner, identity, receiverErrorCode(error));
	};
	const consumer = {
		accept(frame: StreamedSignalResultFrame): void | false {
			if (acceptStreamedSignalResult(owner, frame)) return;
			// Only a still-authorized selector waiting on its dependencies may
			// defer. Bad sequence/resource/attempt frames still fail closed.
			if (isScopeStreamPending(streams, frame.identity)) return false;
			fail(new SignalStreamError('identity'));
			throw new SignalStreamError('identity');
		},
		retainCompleted(frames: StreamedSignalResultFrame[]): boolean {
			return retainCompletedScopeStream(streams, identity, frames);
		},
		fail,
	};
	try {
		let detach = receiver.attachResult(identity, consumer);
		const stopWaiting = whenScopeStreamReady(streams, identity, () => {
			detach = receiver.attachResult(identity, consumer);
		});
		return () => {
			stopWaiting();
			detach();
		};
	} catch (error) {
		fail(error);
		throw error;
	}
}
