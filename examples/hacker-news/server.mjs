// Dev SSR server (shared by the jsx and tsrx apps).
//
//   node server.mjs jsx    -> serves the .tsx app  on PORT (default 5170)
//   node server.mjs tsrx   -> serves the .tsrx app on PORT (default 5170)
//
// Vite runs in middleware mode (appType:'custom'), so it transforms .tsx/.tsrx
// on the fly but does NOT serve index.html itself — we own the HTML response.
// Per request: read index.html, transformIndexHtml (HMR + plugin html hooks),
// ssrLoadModule the app's entry-server, call render(url) (which SSR-renders the
// route with its query data resolved + dehydrated), then splice head/css, the
// rendered body, and the dehydrated state into the shell and send.
import { createServer as createViteServer } from 'vite';
import { createServer as createHttp } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = process.argv[2] || 'jsx';
if (app !== 'jsx' && app !== 'tsrx') {
	console.error(`unknown app "${app}" — use jsx or tsrx`);
	process.exit(1);
}
const APP_DIR = path.join(__dirname, app);
const PORT = Number(process.env.PORT || 5170);

// Inline the dehydrated query cache as a JSON <script>. Escape `<` so the JSON
// can never close the script tag early; the client reads it from #__octane_data.
function serializeState(state) {
	const json = JSON.stringify(state ?? null).replace(/</g, '\\u003c');
	return `<script id="__octane_data" type="application/json">${json}</script>`;
}

const vite = await createViteServer({
	configFile: path.join(APP_DIR, 'vite.config.ts'),
	root: APP_DIR,
	appType: 'custom',
	// Derive the HMR WebSocket port from PORT so the jsx + tsrx SSR servers (and the
	// e2e harness, which boots both) can run concurrently without colliding on
	// Vite's default HMR port.
	server: { middlewareMode: true, hmr: { port: PORT + 100 } },
});

// The StyleX plugin instance (exposes `api.getCss()` — the aggregated atomic sheet).
// In dev, `virtual:stylex.css` is served as JS that injects styles only AFTER the
// client runs, so the server HTML would paint UNSTYLED first (FOUC). We inline the
// sheet into the SSR <head> instead. The aggregate is complete once the route's
// modules have been transformed — i.e. after render() pulls them in.
const stylexPlugin = vite.config.plugins.find((p) => p.name === '@octanejs/stylex');

const server = createHttp((req, res) => {
	vite.middlewares(req, res, async () => {
		const url = req.url || '/';
		try {
			// 1. Read + transform the HTML shell (HMR client, plugin html hooks).
			const templateRaw = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
			const template = await vite.transformIndexHtml(url, templateRaw);

			// 2. Load the app's SSR entry through Vite (so 'octane' resolves to the
			//    server runtime per the app's vite config) and render this URL.
			const { render } = await vite.ssrLoadModule('/entry-server.tsx');
			const { head, body, css, state } = await render(url);

			// 2b. Inline the StyleX atomic sheet so the first paint is styled (no FOUC).
			//     Read AFTER render() so the route's modules are transformed + collected.
			const stylexCss = stylexPlugin?.api?.getCss?.() ?? '';
			const stylexTag = stylexCss ? `<style data-stylex-ssr>${stylexCss}</style>` : '';

			// 3. Splice the SSR output into the shell and send.
			const html = template
				.replace('<!--ssr-head-->', (head || '') + (css || '') + stylexTag)
				.replace('<!--ssr-body-->', body || '')
				.replace('<!--ssr-data-->', serializeState(state));

			res.statusCode = 200;
			res.setHeader('Content-Type', 'text/html');
			res.end(html);
		} catch (err) {
			vite.ssrFixStacktrace(err);
			console.error(err);
			res.statusCode = 500;
			res.end(String(err?.stack || err));
		}
	});
});

server.listen(PORT, () => {
	console.log(`[${app}] SSR dev server: http://localhost:${PORT}`);
});
