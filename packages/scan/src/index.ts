// @octanejs/scan — react-scan for the octane renderer.
//
// The programmatic core of the react-scan port (Phase 2 of
// docs/octane-scan-port-plan.md): automatic render detection over octane's
// profile-build inspection channel. Requires the app to compile with
// `octane({ profile: true })` — octane's production compile strips the
// channel entirely, so unlike react-scan there is nothing to observe in an
// unprofiled bundle (an intentional, documented divergence). Under SSR every
// export is a safe no-op: the server produces no profiler events.
import { __addRenderSink } from './core.js';
import { outlineSink } from './outlines.js';
import { installToolbar } from './toolbar.js';

export {
	scan,
	setOptions,
	getOptions,
	getReport,
	resetReport,
	onRender,
	type Options,
	type OctaneRenderInfo,
	type ComponentReport,
} from './core.js';

// The outline overlay and toolbar are DOM consumers; attach them only where
// a document exists so importing @octanejs/scan stays safe under SSR and in
// workers.
if (typeof document !== 'undefined') {
	__addRenderSink(outlineSink);
	installToolbar();
}
