import { createPendingSignals } from './pending.js';
import { registerPendingSignals } from './transition-state.js';

/**
 * Pending signal state (pending.ts) runs only when both the renderer's
 * transitions and the graph are present. Signals may load after a renderer
 * Action awaited, so the code must already be present when the graph's first
 * write consults the renderer. No import edge loads code only when both are
 * present, so package.json picks the side that carries it, and the other side
 * gets `action-capability-elsewhere.ts`:
 *
 * - `#octane/signal-actions/graph` (default): the graph registers it in
 *   transition-state, and the renderer's transitions find it there.
 *   Renderer-only bundles carry nothing, and signal bundles carry it.
 * - `#octane/signal-actions/renderer` (`octane-islands`): the renderer's
 *   transitions import `action-capability-renderer.ts`, so signal bundles carry
 *   nothing. Islands-only documents load signals without the renderer.
 *
 * The producers that fork resources and derived cells (candidate-producers.ts)
 * follow it. By default the binding modules carry them
 * (`#octane/signal-actions/bindings`), so a bundle that never creates those cells
 * never carries them; under `octane-islands` the renderer does.
 *
 * Either placement is complete: every document that loads the renderer keeps
 * a transition's writes pending as soon as the graph writes.
 */
export function installSignalActions(): void {
	registerPendingSignals(createPendingSignals());
}
