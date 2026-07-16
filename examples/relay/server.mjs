import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { channelMessages, people, threadReplies } from './src/fixtures.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(root, 'dist');
const productionClient = process.env.RELAY_DIST === '1';
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 5224);

if (productionClient && !existsSync(path.join(distRoot, 'index.html'))) {
	throw new Error('RELAY_DIST=1 requires a production build; run `pnpm build` first');
}

const vite = productionClient
	? null
	: await createViteServer({
			configFile: path.join(root, 'vite.config.ts'),
			root,
			appType: 'spa',
			server: { middlewareMode: true, hmr: { port: port + 100 } },
		});

const sessions = new Map();
const allowedChannels = new Set(Object.keys(channelMessages));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function sessionFor(id) {
	let session = sessions.get(id);
	if (session === undefined) {
		session = {
			counter: 0,
			sequence: 0,
			customMessages: [],
			events: [],
			connections: new Map(),
			failures: new Set(),
		};
		sessions.set(id, session);
	}
	return session;
}

function queryContext(request) {
	const url = new URL(request.url ?? '/', `http://${host}:${port}`);
	const sessionId = url.searchParams.get('session')?.trim() ?? '';
	const channel = url.searchParams.get('channel')?.trim() ?? '';
	if (sessionId.length < 4 || sessionId.length > 100)
		throw new Error('A valid session is required');
	if (!allowedChannels.has(channel)) throw new Error('A valid channel is required');
	return { url, sessionId, channel, session: sessionFor(sessionId) };
}

function json(response, status, value) {
	response.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
	});
	response.end(JSON.stringify(value));
}

async function readJsonBody(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > 16_384) throw new Error('Request body is too large');
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function allMessages(session, channel) {
	return [
		...channelMessages[channel],
		...session.customMessages.filter((item) => item.channel === channel),
	].sort((left, right) => left.order - right.order);
}

async function handleHistory(request, response) {
	const { url, sessionId, channel, session } = queryContext(request);
	await delay(120);
	const failureKey = `${sessionId}:${channel}`;
	if (url.searchParams.get('fault') === 'once' && !session.failures.has(failureKey)) {
		session.failures.add(failureKey);
		json(response, 200, { error: 'History is temporarily unavailable' });
		return;
	}

	const messages = allMessages(session, channel);
	const before = url.searchParams.get('before');
	const end = before === null ? messages.length : messages.findIndex((item) => item.id === before);
	const safeEnd = end < 0 ? messages.length : end;
	const pageSize = before === null ? 8 : 6;
	const start = Math.max(0, safeEnd - pageSize);
	json(response, 200, {
		messages: messages.slice(start, safeEnd),
		hasMore: start > 0,
	});
}

function writeEvent(response, event) {
	response.write(`id: ${event.sequence}\n`);
	response.write('event: message\n');
	response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function recordAndBroadcast(session, channel, message) {
	const event = { sequence: ++session.sequence, message };
	session.events.push(event);
	if (session.events.length > 100) session.events.shift();
	for (const response of session.connections.get(channel) ?? []) writeEvent(response, event);
}

function handleStream(request, response) {
	const { url, channel, session } = queryContext(request);
	const fromQuery = Number(url.searchParams.get('since') ?? 0);
	const fromHeader = Number(request.headers['last-event-id'] ?? 0);
	const since = Math.max(
		Number.isFinite(fromQuery) ? fromQuery : 0,
		Number.isFinite(fromHeader) ? fromHeader : 0,
	);

	response.writeHead(200, {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		Connection: 'keep-alive',
		'X-Accel-Buffering': 'no',
	});
	response.write(`event: connection\ndata: ${JSON.stringify({ state: 'live' })}\n\n`);

	let connections = session.connections.get(channel);
	if (connections === undefined) {
		connections = new Set();
		session.connections.set(channel, connections);
	}
	connections.add(response);
	for (const event of session.events) {
		if (event.sequence > since && event.message.channel === channel) writeEvent(response, event);
	}

	const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15_000);
	request.once('close', () => {
		clearInterval(heartbeat);
		connections.delete(response);
		if (connections.size === 0) session.connections.delete(channel);
	});
}

function makeLiveMessage(session, channel, body, clientRequestId, teammate = false) {
	const ordinal = ++session.counter;
	return {
		id: `live-${ordinal}`,
		channel,
		author: teammate ? people.maya : people.avery,
		body,
		sentAt: 'Just now',
		order: 1_000 + ordinal,
		reactions: teammate ? 1 : 0,
		threadCount: 0,
		...(clientRequestId ? { clientRequestId } : {}),
	};
}

async function handlePublish(request, response) {
	const body = await readJsonBody(request);
	const sessionId = String(body.session ?? '').trim();
	const channel = String(body.channel ?? '').trim();
	const text = String(body.body ?? '').trim();
	const clientRequestId = String(body.clientRequestId ?? '').trim();
	if (
		sessionId.length < 4 ||
		!allowedChannels.has(channel) ||
		text.length === 0 ||
		text.length > 800
	) {
		json(response, 400, { error: 'Invalid message' });
		return;
	}
	const session = sessionFor(sessionId);
	const message = makeLiveMessage(session, channel, text, clientRequestId, false);
	session.customMessages.push(message);
	const delay = /first slow/i.test(text) ? 260 : /second fast/i.test(text) ? 35 : 70;
	setTimeout(() => recordAndBroadcast(session, channel, message), delay);
	json(response, 202, { accepted: true, id: message.id });
}

async function handleDemo(request, response) {
	const body = await readJsonBody(request);
	const sessionId = String(body.session ?? '').trim();
	const channel = String(body.channel ?? '').trim();
	if (sessionId.length < 4 || !allowedChannels.has(channel)) {
		json(response, 400, { error: 'Invalid demo request' });
		return;
	}
	const session = sessionFor(sessionId);
	const ordinal = session.counter + 1;
	const bodyText =
		ordinal % 2 === 0
			? 'The customer debrief is posted — the shorter setup tested best.'
			: 'Live update: the launch checklist review starts in ten minutes.';
	const message = makeLiveMessage(session, channel, bodyText, undefined, true);
	session.customMessages.push(message);
	setTimeout(() => recordAndBroadcast(session, channel, message), 45);
	json(response, 202, { accepted: true, id: message.id });
}

function handleThread(request, response) {
	const url = new URL(request.url ?? '/', `http://${host}:${port}`);
	const channel = url.searchParams.get('channel')?.trim() ?? '';
	const messageId = url.searchParams.get('message') ?? '';
	const replies = threadReplies[messageId];
	const parent = allowedChannels.has(channel)
		? channelMessages[channel].find((message) => message.id === messageId)
		: undefined;
	if (parent === undefined || replies === undefined) {
		json(response, 404, { error: 'Thread not found' });
		return;
	}
	json(response, 200, { parentId: messageId, replies });
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
		'.json': 'application/json; charset=utf-8',
	};
	response.writeHead(200, {
		'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
		'Cache-Control': 'public, max-age=31536000, immutable',
	});
	createReadStream(candidate).pipe(response);
	return true;
}

async function serveApp(request, response, pathname) {
	if (productionClient) {
		if (pathname.startsWith('/assets/') && serveAsset(pathname, response)) return;
		response.writeHead(200, {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
		});
		response.end(readFileSync(path.join(distRoot, 'index.html')));
		return;
	}
	await new Promise((resolve, reject) => {
		vite.middlewares(request, response, (error) => (error ? reject(error) : resolve()));
	});
}

const server = createHttpServer(async (request, response) => {
	try {
		const pathname = new URL(request.url ?? '/', `http://${host}:${port}`).pathname;
		if (pathname === '/health') {
			json(response, 200, { ok: true });
			return;
		}
		if (pathname === '/api/history' && request.method === 'GET') {
			await handleHistory(request, response);
			return;
		}
		if (pathname === '/api/stream' && request.method === 'GET') {
			handleStream(request, response);
			return;
		}
		if (pathname === '/api/messages' && request.method === 'POST') {
			await handlePublish(request, response);
			return;
		}
		if (pathname === '/api/demo' && request.method === 'POST') {
			await handleDemo(request, response);
			return;
		}
		if (pathname === '/api/thread' && request.method === 'GET') {
			handleThread(request, response);
			return;
		}
		await serveApp(request, response, pathname);
	} catch (error) {
		vite?.ssrFixStacktrace(error);
		console.error(error);
		if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' });
		response.end(error instanceof Error ? error.stack : String(error));
	}
});

server.listen(port, host, () => {
	console.log(`Relay realtime server listening at http://${host}:${port}`);
});

async function close() {
	for (const session of sessions.values()) {
		for (const connections of session.connections.values()) {
			for (const response of connections) response.end();
		}
	}
	server.close();
	await vite?.close();
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
