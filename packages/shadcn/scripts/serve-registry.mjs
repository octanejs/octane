// Serves registry/ over HTTP so the real shadcn CLI can install from it locally.
//
// WHY THIS EXISTS: the playground's components.json has always pointed at
// `http://localhost:4517/...`, but nothing in the repo ever served that port — the reference was
// dangling, so `npx shadcn add @octane/button` could not work for anyone. This is that server.
//
// Deliberately dependency-free and read-only: it maps a URL path to a file under registry/ and
// refuses anything that escapes it. It exists for local development and for the registry's own
// end-to-end test; production hosting is a static copy of the same directory.
//
// Usage: node scripts/serve-registry.mjs [--port 4517]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(PKG_ROOT, 'registry');

const portFlag = process.argv.indexOf('--port');
const PORT = Number(portFlag !== -1 ? process.argv[portFlag + 1] : (process.env.PORT ?? 4517));

if (!existsSync(ROOT)) {
	console.error('registry/ is missing — run: node scripts/build-registry.mjs');
	process.exit(1);
}

const server = createServer((req, res) => {
	// The CLI only ever GETs.
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.writeHead(405, { allow: 'GET, HEAD' }).end();
		return;
	}

	// Strip the query the CLI appends for namespaced registries, and tolerate an `/r` prefix so
	// the same paths work against a host that serves the registry under /r (as the site does).
	const requested = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
		.replace(/^\/r(?=\/|$)/, '')
		.replace(/^\/+/, '');

	// Contain the resolved path inside registry/. In practice the WHATWG URL parser above has
	// already collapsed any `..` (both raw and percent-encoded) out of `pathname`, so a traversal
	// arrives here as a plain miss and 404s. This is defense in depth for callers that reach the
	// handler without going through that parse — it is not the only thing standing in the way.
	const target = resolve(ROOT, normalize(requested));
	if (target !== ROOT && !target.startsWith(ROOT + '/')) {
		res.writeHead(403).end();
		return;
	}

	if (!existsSync(target) || !statSync(target).isFile()) {
		res
			.writeHead(404, { 'content-type': 'application/json' })
			.end(JSON.stringify({ error: `not found: ${requested}` }));
		return;
	}

	res.writeHead(200, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': '*',
	});
	if (req.method === 'HEAD') {
		res.end();
		return;
	}
	createReadStream(target).pipe(res);
});

server.listen(PORT, () => {
	console.log(`registry served at http://localhost:${PORT}/ (from ${ROOT})`);
	console.log(`  styles: http://localhost:${PORT}/styles/<style>/<name>.json`);
});
