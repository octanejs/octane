// Three pages share one set of data contracts and one server. Octane owns every
// .tsrx file; React owns the .tsx files, which carry a React JSX pragma.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';
import { nodeRequestToWebRequest, sendWebResponse } from '@octanejs/app-core/node';
import type { createShelfServer } from './src/server/index.ts';
import { isShelfPath } from './src/server/routes.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

type ShelfServer = ReturnType<typeof createShelfServer>;

/**
 * Serve the pages and calls to `data`, from the dev server (the source, through
 * Vite's SSR loader) and the preview server (the build).
 */
function shelfServer(): Plugin {
	const middleware =
		(load: () => Promise<ShelfServer>, template: (file: string, url: URL) => Promise<string>) =>
		async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
			// Vite's own requests and assets pass through untouched, whatever state the server module is in.
			if (!isShelfPath(new URL(request.url!, 'http://localhost').pathname)) return next();
			const incoming = nodeRequestToWebRequest(request, response);
			const url = new URL(incoming.url);
			const reply = await (await load()).fetch(incoming, (file) => template(file, url));
			if (reply) await sendWebResponse(response, reply);
			else next();
		};

	return {
		name: 'shelf:server',
		configureServer(vite) {
			// One server, and its data, per evaluation of the server module.
			let current: { module: object; server: ShelfServer } | undefined;
			const load = async () => {
				const module = await vite.ssrLoadModule('/src/server/index.ts');
				if (current?.module !== module) current = { module, server: module.createShelfServer() };
				return current.server;
			};
			const template = async (file: string, url: URL) =>
				vite.transformIndexHtml(url.pathname + url.search, await readFile(root + file, 'utf8'));
			vite.middlewares.use(middleware(load, template));
		},
		configurePreviewServer(preview) {
			const server: Promise<ShelfServer> = import(
				pathToFileURL(`${root}dist/server/index.js`).href
			).then((module) => module.createShelfServer());
			const template = (file: string) => readFile(`${root}dist/${file}`, 'utf8');
			preview.middlewares.use(middleware(() => server, template));
		},
	};
}

const page = (name: string) => `${root}${name}.html`;

export default defineConfig({
	plugins: [
		// The data worker: `/_octane/data-worker.js`, which pages opened with `?owner=shared` share.
		octane({ requireDirective: true, dataWorker: 'src/shared/worker.ts' }),
		react(),
		shelfServer(),
	],
	optimizeDeps: { exclude: ['octane'] },
	build: {
		target: 'esnext',
		rollupOptions: { input: { octane: page('index'), react: page('react'), mixed: page('mixed') } },
	},
	server: { port: 5239, strictPort: true },
});
