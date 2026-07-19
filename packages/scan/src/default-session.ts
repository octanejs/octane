// The default session: the Octane engine adapter wired to the three first-party
// UI plugins. Constructing it starts the Octane source at import — before the
// app hydrates — so every mounted component is nameable. Kept in its own module
// so both the public API (index.ts) and the useScan hook can share the one
// session without a circular import.
import { OctaneInspectionSource } from './sources/octane.js';
import { createSession, type ScanSession } from './session.js';
import { overlayPlugin } from './plugins/overlay.js';
import { inspectorPlugin } from './plugins/inspector.js';
import { toolbarPlugin } from './plugins/toolbar.js';

export const session: ScanSession = createSession(new OctaneInspectionSource());

// UI plugins attach only where a document exists (safe under SSR / in workers).
if (typeof document !== 'undefined') {
	session.use(overlayPlugin());
	session.use(inspectorPlugin());
	session.use(toolbarPlugin());
}
