import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 4177;
const PROBE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROUTES = [
	['/dist/', resolve(PROBE_ROOT, 'dist')],
	['/static/', resolve(PROBE_ROOT, 'node_modules/@lynx-js/web-core/dist/client_prod/static')],
];

const contentTypes = {
	'.bundle': 'application/octet-stream',
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.wasm': 'application/wasm',
};

function resolveRequest(url) {
	if (url === '/') return resolve(PROBE_ROOT, 'web/index.html');
	for (const [prefix, root] of ROUTES) {
		if (!url.startsWith(prefix)) continue;
		const path = resolve(root, url.slice(prefix.length));
		if (path === root || path.startsWith(`${root}${sep}`)) return path;
	}
	return undefined;
}

const server = createServer(async (request, response) => {
	try {
		const path = resolveRequest(new URL(request.url ?? '/', `http://localhost:${PORT}`).pathname);
		if (!path || !(await stat(path)).isFile()) {
			response.writeHead(404).end('Not found');
			return;
		}
		response.writeHead(200, {
			'Access-Control-Allow-Origin': '*',
			'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
		});
		createReadStream(path).pipe(response);
	} catch {
		response.writeHead(404).end('Not found');
	}
});

server.listen(PORT, '127.0.0.1', () => {
	process.stdout.write(`Octane Lynx Phase 0 web probe: http://127.0.0.1:${PORT}/\n`);
});
