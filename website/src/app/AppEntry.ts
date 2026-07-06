// The RenderRoute entry for @octanejs/vite-plugin (both '/' and '/*splat').
// The plugin's generated client entry does `await import(<this module>)` and
// then immediately `hydrateRoot(target, App, { params })` — so the top-level
// await below is what guarantees the client router's matches are committed
// BEFORE the first hydration render (an empty match tree would adopt nothing
// and wipe the server DOM). On the server (ssrLoadModule) the guard skips it.
import { App } from './App.tsrx';

if (typeof document !== 'undefined') {
	const { ensureClientRouterReady } = await import('./router-client.ts');
	await ensureClientRouterReady();
}

export { App };
