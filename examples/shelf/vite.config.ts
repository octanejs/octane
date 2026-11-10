// Three pages share one set of data contracts and one server. Octane owns every
// .tsrx file; React owns the .tsx files, which carry a React JSX pragma.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';
import type { createShelfServer, Page } from './src/server/index.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

type ShelfServer = ReturnType<typeof createShelfServer>;

/** Server-rendered pages. The mixed page is rendered in the browser only. */
const PAGES: Record<string, { page: Page; file: string }> = {
	'/': { page: 'octane', file: 'index.html' },
	'/index.html': { page: 'octane', file: 'index.html' },
	'/react.html': { page: 'react', file: 'react.html' },
};

/**
 * Serve /data and render the Octane and React pages, from the dev server (the
 * source, through Vite's SSR loader) and the preview server (the build).
 */
function shelfServer(): Plugin {
	const middleware =
		(load: () => Promise<ShelfServer>, template: (file: string, url: URL) => Promise<string>) =>
		async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
			const url = new URL(request.url!, `http://${request.headers.host}`);
			const route = request.method === 'GET' ? PAGES[url.pathname] : undefined;
			if (url.pathname !== '/data' && !route) return next();
			const server = await load();
			if (route) {
				const html = await server.render(route.page, url, await template(route.file, url));
				response.setHeader('content-type', 'text/html');
				response.end(html);
				return;
			}
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(chunk as Buffer);
			const headers = new Headers();
			for (const [name, value] of Object.entries(request.headers)) {
				if (typeof value === 'string') headers.set(name, value);
			}
			const reply = await server.data(
				new Request(url, {
					method: request.method,
					headers,
					body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
				}),
			);
			response.statusCode = reply.status;
			reply.headers.forEach((value, name) => response.setHeader(name, value));
			response.end(Buffer.from(await reply.arrayBuffer()));
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
	plugins: [octane({ requireDirective: true }), react(), shelfServer()],
	optimizeDeps: { exclude: ['octane'] },
	build: {
		target: 'esnext',
		rollupOptions: { input: { octane: page('index'), react: page('react'), mixed: page('mixed') } },
	},
	server: { port: 5239, strictPort: true },
});
