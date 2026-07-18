import { installPhase0MainThread } from './runtime-bridge.mjs';

const application = installPhase0MainThread(globalThis);
globalThis.__OCTANE_LYNX_PHASE_0__ = application;
globalThis.renderPage = () => application;
globalThis.updatePage = () => application;
globalThis.updateGlobalProps = () => application;
