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
import path, { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(PKG_ROOT, 'registry');

// Resolve `requested` inside `root`, or null if it escapes.
//
// Containment is tested with `relative()` rather than a string prefix. A prefix check has to
// append a separator to `root` to avoid matching a sibling like `registry-old/`, and hardcoding
// `/` there breaks on Windows: `resolve` returns backslashes, so EVERY in-tree file fails the
// test and the server 403s all of them. CI is Linux-only, so nothing here would have caught that.
//
// `pathImpl` is injectable purely so the win32 behavior can be asserted from a Linux test run.
export function containedPath(root, requested, pathImpl = path) {
	const target = pathImpl.resolve(root, pathImpl.normalize(requested));
	const rel = pathImpl.relative(root, target);
	// Empty means the root itself; `..` or an absolute result means it escaped.
	if (rel !== '' && (rel.startsWith('..') || pathImpl.isAbsolute(rel))) return null;
	return target;
}

export function createRegistryServer() {
	return createServer((req, res) => {
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

		const target = containedPath(ROOT, requested);
		if (target === null) {
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
}

// Only when run directly. The module also exports `containedPath` for tests, and importing it
// must not start a listener or call process.exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (!existsSync(ROOT)) {
		console.error('registry/ is missing — run: node scripts/build-registry.mjs');
		process.exit(1);
	}

	const portFlag = process.argv.indexOf('--port');
	const PORT = Number(portFlag !== -1 ? process.argv[portFlag + 1] : (process.env.PORT ?? 4517));

	createRegistryServer().listen(PORT, () => {
		console.log(`registry served at http://localhost:${PORT}/ (from ${ROOT})`);
		console.log(`  styles: http://localhost:${PORT}/styles/<style>/<name>.json`);
	});
}
