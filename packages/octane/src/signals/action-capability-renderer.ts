import { installDerivedCandidates, installResourceCandidates } from './candidate-producers.js';
import { SignalActionFrame } from './transition-action.js';
export { createSignalTransitionCoordinator } from './transition-coordinator.js';

/**
 * `#octane/signal-actions/renderer` under `octane-islands` (see
 * action-capability.ts): the renderer carries the frame and its candidate
 * producers, so signal bundles carry neither. Frames come only from this
 * factory, so it installs the producers itself; a bundler may drop a module
 * statement from this side-effect-free package.
 */
export function createSignalActionFrame(): SignalActionFrame {
	installResourceCandidates();
	installDerivedCandidates();
	return new SignalActionFrame();
}
