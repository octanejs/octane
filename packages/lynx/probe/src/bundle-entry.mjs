import { installPhase0Background, installPhase0MainThread } from './runtime-bridge.mjs';

if (globalThis.__MAIN_THREAD__) {
	const application = installPhase0MainThread(globalThis);
	globalThis.__OCTANE_LYNX_PHASE_0__ = application;
	globalThis.renderPage = () => application;
	globalThis.updatePage = () => application;
	globalThis.updateGlobalProps = () => application;
} else if (globalThis.__BACKGROUND__) {
	globalThis.__OCTANE_LYNX_PHASE_0__ = installPhase0Background(globalThis);
}
