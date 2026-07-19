// @octanejs/scan — a multi-engine render-inspection subsystem, shipping the
// Octane engine adapter.
//
// Architecture (dependency flows strictly downward):
//
//   InspectionSource (engine adapter)  ← sources/octane.ts
//        ↓ normalized InspectionEvents
//   Pipeline (dispatch + commit batching)
//        ↓
//   Services (options · registry · report · interactions · selection · fps)
//        ↓
//   Plugins (overlay · toolbar · inspector · your own)
//
// The public surface below mirrors react-scan's API on a default session wired
// to the Octane source and the three first-party UI plugins. The architecture
// itself (createSession, definePlugin, the contract, the Octane source) is also
// exported so a host can compose its own session, add plugins, or drop in a
// different engine adapter.
import { componentId } from './sources/octane.js';
import { session } from './default-session.js';
import type { ScanSession } from './session.js';
import type { Options } from './services/options.js';
import type { ComponentReport } from './services/report.js';
import type { InspectionEvent } from './contract.js';

/** Start scanning (idempotent); enables unless the caller says otherwise. */
export function scan(next: Partial<Options> = {}): void {
	session.setOptions({ enabled: true, ...next });
}

export function setOptions(patch: Partial<Options>): void {
	session.setOptions(patch);
}

export function getOptions(): Options {
	return session.getOptions();
}

/** Aggregated per-component render counts and timings since the last reset. */
export function getReport(): ComponentReport[] {
	return session.report.all();
}

export function resetReport(): void {
	session.report.reset();
}

/**
 * Observe renders of one component. Matches react-scan's
 * `onRender(Component, callback)`; the callback receives the normalized
 * `InspectionEvent` (Octane has no `Fiber`). Returns the detach function.
 */
export function onRender(
	component: Function,
	callback: (event: InspectionEvent) => void,
): () => void {
	const id = componentId(component);
	return session.onEvent((event) => {
		if (event.component.id === id) {
			try {
				callback(event);
			} catch {
				// Consumer callbacks must never break the app being scanned.
			}
		}
	});
}

/** The default session, for hosts that want to add plugins or read services. */
export function getSession(): ScanSession {
	return session;
}

export { useScan } from './use-scan.js';

// The architecture surface — compose your own session or engine adapter.
export { createSession, type ScanSession } from './session.js';
export { OctaneInspectionSource } from './sources/octane.js';
export { definePlugin, type Plugin, type PluginContext } from './plugin.js';
export { overlayPlugin } from './plugins/overlay.js';
export { toolbarPlugin } from './plugins/toolbar.js';
export { inspectorPlugin } from './plugins/inspector.js';
export type {
	InspectionEvent,
	CommitEvent,
	ComponentIdentity,
	ScheduleCause,
	InspectionSource,
	InspectionSink,
	SourceCapabilities,
} from './contract.js';
export type { Options } from './services/options.js';
export type { ComponentReport } from './services/report.js';
export type { InteractionRecord, Severity } from './services/interactions.js';
export type { Selection, SelectionMode } from './services/selection.js';
export type { ComponentInstance } from './services/registry.js';
