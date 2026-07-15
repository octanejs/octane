import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { editorial, findTitle, searchCatalog } from './src/data.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(root, 'dist');
const productionClient = process.env.CINEBASE_DIST === '1';
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 5222);

if (productionClient && !existsSync(path.join(distRoot, 'index.html'))) {
	throw new Error('CINEBASE_DIST=1 requires a production build; run `pnpm build` first');
}

const vite = await createViteServer({
	configFile: path.join(root, 'vite.config.ts'),
	root,
	appType: 'custom',
	server: { middlewareMode: true, hmr: { port: port + 100 } },
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJsonBody(request) {
	const chunks = [];
	for await (const chunk of request) chunks.push(chunk);
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleGraphql(request, response) {
	try {
		const body = await readJsonBody(request);
		const variables = body.variables ?? {};
		if (body.operationName === 'Catalog') {
			const search = String(variables.search ?? '');
			const genre = String(variables.genre ?? '');
			const recover = variables.recover === true;
			const latency = search.toLowerCase().includes('moon')
				? 420
				: search.toLowerCase().includes('harbor')
					? 35
					: 70;
			await delay(latency);
			if (search.toLowerCase() === 'outage' && !recover) {
				response.writeHead(200, { 'Content-Type': 'application/json' });
				response.end(JSON.stringify({ errors: [{ message: 'The catalog relay is offline' }] }));
				return;
			}
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify({ data: { catalog: searchCatalog(search, genre) } }));
			return;
		}
		if (body.operationName === 'Title') {
			await delay(55);
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify({ data: { title: findTitle(String(variables.id ?? '')) } }));
			return;
		}
		response.writeHead(400, { 'Content-Type': 'application/json' });
		response.end(JSON.stringify({ errors: [{ message: 'Unknown Cinebase operation' }] }));
	} catch (error) {
		response.writeHead(400, { 'Content-Type': 'application/json' });
		response.end(JSON.stringify({ errors: [{ message: String(error) }] }));
	}
}

function serveAsset(pathname, response) {
	const candidate = path.resolve(distRoot, `.${pathname}`);
	if (!candidate.startsWith(`${distRoot}${path.sep}`) || !existsSync(candidate)) return false;
	const stats = statSync(candidate);
	if (!stats.isFile()) return false;
	const extension = path.extname(candidate);
	const contentTypes = {
		'.css': 'text/css; charset=utf-8',
		'.js': 'text/javascript; charset=utf-8',
		'.svg': 'image/svg+xml',
		'.json': 'application/json',
	};
	response.writeHead(200, {
		'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
		'Cache-Control': 'public, max-age=31536000, immutable',
	});
	createReadStream(candidate).pipe(response);
	return true;
}

function serializeCache(cache) {
	return JSON.stringify(cache).replace(/</g, '\\u003c');
}

async function renderPage(request, response) {
	const requestUrl = request.url ?? '/';
	const origin = `http://${host}:${port}`;
	let template = readFileSync(
		productionClient ? path.join(distRoot, 'index.html') : path.join(root, 'index.html'),
		'utf8',
	);
	if (!productionClient) template = await vite.transformIndexHtml(requestUrl, template);
	const [prefix, remainder] = template.split('<!--ssr-body-->');
	if (remainder === undefined) throw new Error('Cinebase index is missing <!--ssr-body-->');
	const cacheMarkup = `<script id="__cinebase_cache" type="application/json">`;
	const { render } = await vite.ssrLoadModule('/src/entry-server.ts');
	const rendered = await render(requestUrl, origin);
	const suffix = remainder
		.replace('<!--ssr-data-->', `${cacheMarkup}${serializeCache(rendered.cache)}</script>`)
		.replace('<!--ssr-head-->', '');

	response.writeHead(200, {
		'Content-Type': 'text/html; charset=utf-8',
		'Cache-Control': 'no-store',
		'Transfer-Encoding': 'chunked',
	});
	response.write(prefix.replace('<!--ssr-head-->', ''));

	const body = new PassThrough();
	body.on('data', (chunk) => response.write(chunk));
	body.on('end', () => response.end(suffix));
	body.on('error', (error) => response.destroy(error));
	response.once('close', () => {
		if (!response.writableEnded) rendered.stream.abort(new Error('request closed'));
	});
	rendered.stream.pipe(body);
}

const server = createHttpServer(async (request, response) => {
	try {
		const pathname = new URL(request.url ?? '/', `http://${host}:${port}`).pathname;
		if (pathname === '/health') {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify({ ok: true }));
			return;
		}
		if (pathname === '/graphql' && request.method === 'POST') {
			await handleGraphql(request, response);
			return;
		}
		if (pathname === '/api/editorial') {
			await delay(180);
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify(editorial));
			return;
		}
		if (productionClient && pathname.startsWith('/assets/') && serveAsset(pathname, response))
			return;
		if (!productionClient) {
			await new Promise((resolve, reject) => {
				vite.middlewares(request, response, (error) => (error ? reject(error) : resolve()));
			});
			if (response.headersSent || response.writableEnded) return;
		}
		await renderPage(request, response);
	} catch (error) {
		vite.ssrFixStacktrace(error);
		console.error(error);
		if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' });
		response.end(error instanceof Error ? error.stack : String(error));
	}
});

server.listen(port, host, () => {
	console.log(`Cinebase streaming server listening at http://${host}:${port}`);
});

async function close() {
	server.close();
	await vite.close();
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
