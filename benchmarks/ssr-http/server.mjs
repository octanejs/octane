// Generic minimal HTTP host for the ssr-http suite. The SAME ~20 lines front
// every target — that symmetry is the fairness argument: any measured gap is
// the renderer's, not the host's.
//
// Env contract (set by run.mjs):
//   ENTRY    — absolute path to a built entry-server.js exporting
//              renderStream(scenario, onChunk) → Promise<void>
//   SCENARIO — 'staggered' | 'all-fast' (fixed per boot, like a route)
//   PORT     — port to listen on (127.0.0.1)
//
// No ready-print: the parent detects listening via TCP connect probes
// (lib/http-timing.mjs), the same methodology used for servers whose stdout we
// don't control. The entry import happens before listen, so spawn→listen
// includes module parse+eval — that is the point.
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.env.ENTRY).href);
const scenario = process.env.SCENARIO;

http
	.createServer((req, res) => {
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		mod
			.renderStream(scenario, (chunk) => res.write(chunk))
			.then(
				() => res.end(),
				(error) => {
					console.error(error);
					if (!res.headersSent) res.statusCode = 500;
					res.end();
				},
			);
	})
	.listen(Number(process.env.PORT), '127.0.0.1');
