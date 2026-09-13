/** @jsxImportSource octane */
import { createRoot } from 'octane';
import * as octaneInspect from 'octane/inspect';
import { formatElementInfo, getGlobalApi, init } from '@octanejs/grab';
import { freeze, unfreeze } from '@octanejs/grab/primitives';
import '@octanejs/grab/styles.css';
import { App } from './App.tsx';
import './index.css';

declare global {
	interface Window {
		initReactGrab: typeof init;
		initOctaneGrab: typeof init;
		formatElementInfo: typeof formatElementInfo;
		freezeReactGrab: typeof freeze;
		unfreezeReactGrab: typeof unfreeze;
		__OCTANE_INSPECT__: typeof octaneInspect;
		__OCTANE_GRAB__?: unknown;
		__REACT_GRAB__?: unknown;
	}
}

// Local probe surface for verifying host→owner walks (not for commit).
window.__OCTANE_INSPECT__ = octaneInspect;

// Match upstream e2e-app-vite/src/main.tsx window surface.
window.initReactGrab = init;
window.initOctaneGrab = init;
window.formatElementInfo = formatElementInfo;
window.freezeReactGrab = freeze;
window.unfreezeReactGrab = unfreeze;

const target = document.getElementById('root');
if (!target) throw new Error('missing #root');

createRoot(target).render(App);

// `@octanejs/grab` auto-inits on import; a second init() returns a noop API.
const api =
	getGlobalApi() ??
	(window.__OCTANE_GRAB__ as ReturnType<typeof init> | undefined) ??
	(window.__REACT_GRAB__ as ReturnType<typeof init> | undefined) ??
	init();

// Optional: ?activate=1 starts the overlay (upstream e2e activates via tests / key hold).
if (new URLSearchParams(window.location.search).has('activate')) {
	api.activate();
}
