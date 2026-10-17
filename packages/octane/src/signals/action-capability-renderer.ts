import { installDerivedCandidates, installResourceCandidates } from './candidate-producers.js';
import { createPendingSignals } from './pending.js';
import { registerPendingSignals } from './transition-state.js';

/**
 * `#octane/signal-actions/renderer` under `octane-islands` (see
 * action-capability.ts): the renderer's transitions carry pending signal state
 * and its candidate producers, so signal bundles carry neither. Only this
 * installer creates pending state in that build, so it installs the producers
 * itself; a bundler may drop a module statement from this side-effect-free
 * package.
 */
export function installRendererSignalActions(): void {
	installResourceCandidates();
	installDerivedCandidates();
	registerPendingSignals(createPendingSignals());
}
