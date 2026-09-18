// During grab mode the page must freeze visually. Upstream patches React's
// internal dispatcher to buffer useState/useReducer/useTransition/
// useSyncExternalStore calls while frozen and replays them on unfreeze.
//
// Octane has no equivalent public capability: state setters dispatch through
// the runtime's scheduler, which exposes no pause/buffer channel. Until Octane
// grows one, update pausing degrades to a refcounted no-op — the DOM-level
// freeze (pointer-events, animations, registered renderer freezes) in
// freeze-renderers.ts still applies. This mirrors upstream's own degradation
// when no React devtools renderer is present.

import { RecoverableError } from '../errors.js';
import { reportRecoverableError } from './report-recoverable-error.js';
import { IS_DEMO } from './runtime-mode.js';

let freezeOwnerCount = 0;

export const freezeUpdatesOrThrow = (): (() => void) => {
	// Demo mode is display-only and must never pause the host app's renders,
	// even via the toolbar's own (ungated) freeze path.
	if (IS_DEMO) return () => {};

	freezeOwnerCount += 1;

	let didReleaseFreeze = false;

	return () => {
		if (didReleaseFreeze) return;
		didReleaseFreeze = true;
		freezeOwnerCount -= 1;
	};
};

export const freezeUpdates = (): (() => void) => {
	try {
		return freezeUpdatesOrThrow();
	} catch (error) {
		reportRecoverableError(new RecoverableError('Pausing updates failed', error));
		return () => {};
	}
};
