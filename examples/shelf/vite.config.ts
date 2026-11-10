// Three pages share one set of data contracts and one server. Octane owns every
// .tsrx file; React owns the .tsx files, which carry a React JSX pragma.
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer, defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Serve the data handler at /data from the dev and preview servers. The
 * handler and `octane/data` are TypeScript source, so Vite's SSR loader runs
 * them: the dev server's own, or a private one for preview.
 */
function shelfServer(): Plugin {
	let handler: Promise<(request: Request) => Promise<Response>> | undefined;
	const load = (vite: ViteDevServer) =>
		(handler ??= vite
			.ssrLoadModule('/src/shared/server.ts')
			.then((module) => module.createShelfHandler()));

	const serve =
		(vite: () => Promise<ViteDevServer>) =>
		async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
			if (request.url !== '/data') return next();
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(chunk as Buffer);
			const headers = new Headers();
			for (const [name, value] of Object.entries(request.headers)) {
				if (typeof value === 'string') headers.set(name, value);
			}
			const handle: (request: Request) => Promise<Response> = await load(await vite());
			const reply = await handle(
				new Request(`http://${request.headers.host}${request.url}`, {
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
		name: 'shelf:data-server',
		configureServer(server) {
			server.middlewares.use(serve(async () => server));
		},
		configurePreviewServer(server) {
			let loader: Promise<ViteDevServer> | undefined;
			server.middlewares.use(
				serve(
					() =>
						(loader ??= createServer({
							root,
							configFile: false,
							appType: 'custom',
							server: { middlewareMode: true, hmr: false },
						})),
				),
			);
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
