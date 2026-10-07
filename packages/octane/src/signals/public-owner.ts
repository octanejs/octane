import { installPublicScope } from './engine.js';
import {
	currentSignalOwner as currentOwner,
	installSignalOwnerEnvironment as installEnvironment,
} from './owner-context.js';
import type { SignalOwner, SignalOwnerEnvironment } from './types.js';

// The active owner can be a scope the runtime created for compiled
// declarations, which has no public Scope methods until createScope installs
// them. These public routes hand owners to application code, so they install
// the methods first. The runtime keeps owner-context's engine-free versions,
// and octane/server's carrier sees owners only as identities.

/** The active signal owner, or null outside one. */
export function currentSignalOwner(): SignalOwner | null {
	installPublicScope();
	return currentOwner();
}

/** Install a concurrency-safe owner carrier; returns its restore function. */
export function installSignalOwnerEnvironment(environment: SignalOwnerEnvironment): () => void {
	const restore = installEnvironment(environment);
	installPublicScope();
	return restore;
}
