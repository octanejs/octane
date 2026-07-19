// Harbor's dev/e2e SSR server (hacker-news pattern, streaming variant): Node
// http + Vite in middleware mode. The React shell streams via Fizz between
// the transformed index.html's prefix and suffix, split on <!--ssr-outlet-->
// inside #root. SSR stays source-driven under NODE_ENV=production for the
// e2e run — the documented example-server contract; no prod SSR bundle in v1.
import { createServer as createViteServer } from 'vite';
import { createServer as createHttp } from 'node:http';
import { Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5178);

const vite = await createViteServer({
	configFile: path.join(__dirname, 'vite.config.ts'),
	root: __dirname,
	appType: 'custom',
	// Derive the HMR WebSocket port from PORT so concurrent example servers
	// (the e2e harness boots several) never collide on Vite's default.
	server: { middlewareMode: true, hmr: { port: PORT + 100 } },
});

const server = createHttp((req, res) => {
	vite.middlewares(req, res, async () => {
		const url = req.url || '/';
		try {
			// 1. Read + transform the HTML shell (HMR client, refresh preamble,
			//    plugin html hooks), then split around the Fizz outlet.
			const template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
			const html = await vite.transformIndexHtml(url, template);
			const [prefix, suffix] = html.split('<!--ssr-outlet-->');

			// 2. Load the server entry through Vite's SSR pipeline (islands compile
			//    in server mode automatically) and stream the app into #root.
			const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
			const stream = render(url, {
				onShellReady() {
					res.statusCode = 200;
					res.setHeader('Content-Type', 'text/html; charset=utf-8');
					res.write(prefix);
					// Fizz ends this writable when the stream completes; final() then
					// closes the document with the shell suffix.
					stream.pipe(
						new Writable({
							write(chunk, encoding, callback) {
								res.write(chunk, encoding, callback);
							},
							final(callback) {
								res.end(suffix, callback);
							},
						}),
					);
				},
				onShellError(error) {
					vite.ssrFixStacktrace(error);
					console.error(error);
					res.statusCode = 500;
					res.setHeader('Content-Type', 'text/plain; charset=utf-8');
					res.end('shell render failed');
				},
				onError(error) {
					// Island server faults route here (Fizz onError), NEVER into the
					// React error boundary — the fault journey is client-side only.
					vite.ssrFixStacktrace(error);
					console.error(error);
				},
			});
			res.on('close', () => {
				if (!res.writableEnded) stream.abort();
			});
		} catch (error) {
			vite.ssrFixStacktrace(error);
			console.error(error);
			res.statusCode = 500;
			res.setHeader('Content-Type', 'text/plain; charset=utf-8');
			res.end('internal error');
		}
	});
});

server.listen(PORT, () => {
	console.log(`harbor ready on http://localhost:${PORT}`);
});
