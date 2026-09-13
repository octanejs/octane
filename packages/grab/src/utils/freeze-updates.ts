/**
 * Freeze Octane updates while grab mode is active.
 *
 * Upstream react-grab patches React's internal dispatcher via bippy. Octane
 * exposes `pauseUpdates` through `octane/inspect` (wired here via the adapter).
 * Animation / pointer freezes remain in sibling modules.
 */
import { RecoverableError } from '../errors.js';
import { reportRecoverableError } from './report-recoverable-error.js';
import { IS_DEMO } from './runtime-mode.js';
import { freezeOctaneUpdates } from '../octane-adapter.js';

let freezeOwnerCount = 0;
let activeResume: (() => void) | null = null;

export const freezeUpdatesOrThrow = (): (() => void) => {
	// Demo mode is display-only and must never pause the host app's renders,
	// even via the toolbar's own (ungated) freeze path.
	if (IS_DEMO) return () => {};

	const isFirstFreezeOwner = freezeOwnerCount === 0;
	freezeOwnerCount += 1;

	if (isFirstFreezeOwner) {
		try {
			activeResume = freezeOctaneUpdates();
		} catch (error) {
			freezeOwnerCount -= 1;
			throw error;
		}
	}

	let didReleaseFreeze = false;

	return () => {
		if (didReleaseFreeze) return;
		didReleaseFreeze = true;
		freezeOwnerCount -= 1;
		if (freezeOwnerCount === 0 && activeResume) {
			const resume = activeResume;
			activeResume = null;
			resume();
		}
	};
};

export const freezeUpdates = (): (() => void) => {
	try {
		return freezeUpdatesOrThrow();
	} catch (error) {
		reportRecoverableError(new RecoverableError('Pausing Octane updates failed', error));
		return () => {};
	}
};
