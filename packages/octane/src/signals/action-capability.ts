import { SignalActionFrame } from './transition-action.js';
import { createSignalTransitionCoordinator } from './transition-coordinator.js';
import {
	registerSignalActionFrameFactory,
	registerSignalTransitionCoordinatorFactory,
} from './transition-state.js';

/**
 * Only the renderer creates signal Action frames, and only once the graph has
 * loaded. Signals may still load after a renderer Action awaited, so the frame
 * must already be present when the graph's first write consults the renderer.
 * No import edge loads code only when both are present, so package.json picks the
 * side that carries the frame, and the other side gets
 * `action-capability-elsewhere.ts`:
 *
 * - `#octane/signal-actions/graph` (default): the graph registers the factories
 *   below in transition-state, and the renderer reads them from there.
 *   Renderer-only bundles carry nothing, and signal bundles carry the frame.
 * - `#octane/signal-actions/renderer` (`octane-islands`): the renderer imports
 *   `action-capability-renderer.ts`, so signal bundles carry nothing.
 *   Islands-only documents load signals without the renderer.
 *
 * The frame's producers for resources and derived cells (candidate-producers.ts)
 * follow it. By default the binding modules carry them
 * (`#octane/signal-actions/bindings`), so a bundle that never creates those cells
 * never carries them; under `octane-islands` the renderer does.
 *
 * Either placement is complete: every document that loads the renderer can
 * create a frame as soon as the graph writes.
 */
export function installSignalActions(): void {
	registerSignalActionFrameFactory(() => new SignalActionFrame());
	registerSignalTransitionCoordinatorFactory(createSignalTransitionCoordinator);
}
