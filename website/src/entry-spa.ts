// SPA bootstrap for the PRODUCTION client build. @octanejs/vite-plugin's
// production SSR output is Phase 2 (not implemented yet), so `vite build`
// produces a client-only bundle booted from here. In dev SSR this script also
// loads (it's in index.html), but the plugin injected its own hydrate entry —
// the #__octane_data marker tells us to stand down and let hydration run.
import { createRoot } from 'octane';
import { App } from './app/App.tsrx';
import { ensureClientRouterReady } from './app/router-client.ts';

const data = document.getElementById('__octane_data');
const container = document.getElementById('root');

if (!data && container) {
	await ensureClientRouterReady();
	createRoot(container).render(App, {});
}
