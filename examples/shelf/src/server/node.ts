/**
 * The Rspack build's server (rspack.mjs): the pages and calls to `data` from
 * `createShelfServer`, and everything else from the client build. Vite's dev
 * and preview servers do the same for the Vite build (vite.config.ts).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeRequestToWebRequest, sendWebResponse, serveStaticFile } from '@octanejs/app-core/node';
import { createShelfServer } from './index.ts';

// This file is built to dist-rspack/server/index.js, beside the client build.
const client = join(dirname(fileURLToPath(import.meta.url)), '..');
const shelf = createShelfServer();
const template = (file: string) => readFile(join(client, file), 'utf8');

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 5239);
createServer(async (request, response) => {
	const reply = await shelf.fetch(nodeRequestToWebRequest(request, response), template);
	if (reply) await sendWebResponse(response, reply);
	else if (!serveStaticFile(request, response, client)) response.writeHead(404).end();
}).listen(port, host, () => console.log(`Shelf (Rspack) on http://${host}:${port}`));
