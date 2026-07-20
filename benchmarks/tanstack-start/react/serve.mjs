// Minimal production server for the React flavor: static client assets first,
// then the Start server's fetch handler (the srvx server default-exported by
// dist/server/server.js). Mirrors upstream's e2e server contract without the
// express/proxy test plumbing, so both flavors run a comparably thin Node
// front: octane's nitro output vs react-start's srvx output.
import { createServer } from 'node:http';
import { toNodeHandler } from 'srvx/node';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3010);
const clientDir = path.join(__dirname, 'dist', 'client');

const startServer = (await import('./dist/server/server.js')).default;
const nodeHandler = toNodeHandler(startServer.fetch);

const MIME = {
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.html': 'text/html',
	'.json': 'application/json',
	'.ico': 'image/x-icon',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain',
	'.webmanifest': 'application/manifest+json',
};

const server = createServer((req, res) => {
	const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	if (pathname !== '/' && !pathname.includes('..')) {
		const file = path.join(clientDir, pathname);
		if (fs.existsSync(file) && fs.statSync(file).isFile()) {
			res.statusCode = 200;
			res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
			fs.createReadStream(file).pipe(res);
			return;
		}
	}
	nodeHandler(req, res).catch((error) => {
		console.error(error);
		if (!res.headersSent) res.statusCode = 500;
		res.end('internal error');
	});
});

server.listen(PORT, () => {
	console.log(`react flavor ready on http://localhost:${PORT}`);
});
