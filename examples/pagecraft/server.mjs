import { createReadStream, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ListItemNode, ListNode } from '@lexical/list';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { $getRoot, createEditor } from 'lexical';
import { createServer as createViteServer } from 'vite';
import { documents as fixtureDocuments } from './src/fixtures.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(root, 'dist');
const productionClient = process.env.PAGECRAFT_DIST === '1';
const coldDevClient = !productionClient && process.env.PAGECRAFT_COLD_DEV === '1';
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 5226);
const coldDevCache = path.join(root, 'node_modules/.vite-pagecraft-cold');

if (productionClient && !existsSync(path.join(distRoot, 'index.html'))) {
	throw new Error('PAGECRAFT_DIST=1 requires a production build; run `pnpm build` first');
}

if (coldDevClient) rmSync(coldDevCache, { recursive: true, force: true });

const vite = productionClient
	? null
	: await createViteServer({
			configFile: path.join(root, 'vite.config.ts'),
			root,
			...(coldDevClient ? { cacheDir: coldDevCache } : {}),
			appType: 'spa',
			server: { middlewareMode: true, hmr: { port: port + 100 } },
		});

const sessions = new Map();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function cloneFixtures() {
	return new Map(
		fixtureDocuments.map((document) => [
			document.id,
			{ ...structuredClone(document), acceptedVersion: document.version },
		]),
	);
}

function sessionFor(id) {
	let session = sessions.get(id);
	if (session === undefined) {
		session = { documents: cloneFixtures(), failures: new Set() };
		sessions.set(id, session);
	}
	return session;
}

function requestContext(request) {
	const url = new URL(request.url ?? '/', `http://${host}:${port}`);
	const sessionId = url.searchParams.get('session')?.trim() ?? '';
	if (sessionId.length < 4 || sessionId.length > 100)
		throw new Error('A valid session is required');
	return { url, sessionId, session: sessionFor(sessionId) };
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
		if (size > 1_000_000) throw new Error('Request body is too large');
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function summaries(session) {
	return fixtureDocuments
		.map(({ id }) => session.documents.get(id))
		.filter(Boolean)
		.map(({ id, title, eyebrow, updatedAt }) => ({ id, title, eyebrow, updatedAt }));
}

function publicDocument(document) {
	const { acceptedVersion: _acceptedVersion, ...value } = document;
	return value;
}

async function handleList(request, response) {
	const { session } = requestContext(request);
	await delay(90);
	json(response, 200, { ok: true, documents: summaries(session) });
}

async function handleLoad(request, response, documentId) {
	const { url, sessionId, session } = requestContext(request);
	await delay(documentId === 'field-notes' ? 180 : 110);
	const failureKey = `${sessionId}:load`;
	if (url.searchParams.get('fault') === 'load' && !session.failures.has(failureKey)) {
		session.failures.add(failureKey);
		json(response, 200, {
			ok: false,
			kind: 'temporary',
			message: 'This document took a wrong turn. Your workspace is still here.',
		});
		return;
	}
	const document = session.documents.get(documentId);
	if (document === undefined) {
		json(response, 200, {
			ok: false,
			kind: 'not-found',
			message: 'We could not find that document.',
		});
		return;
	}
	json(response, 200, { ok: true, document: publicDocument(document) });
}

const validationEditor = createEditor({
	namespace: 'PagecraftServerDocumentValidation',
	nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
	onError: (error) => {
		throw error;
	},
});

function validateEditorState(value) {
	if (typeof value !== 'string' || value.length === 0 || value.length > 800_000) return null;
	try {
		const editorState = validationEditor.parseEditorState(value);
		let plainText = '';
		editorState.read(() => {
			plainText = $getRoot().getTextContent();
		});
		if (plainText.length > 100_000) return null;
		return { plainText };
	} catch {
		return null;
	}
}

async function handleSave(request, response, documentId) {
	const { url, sessionId, session } = requestContext(request);
	const document = session.documents.get(documentId);
	if (document === undefined) {
		json(response, 200, { ok: false, message: 'Document not found' });
		return;
	}
	const body = await readJsonBody(request);
	const title = typeof body.title === 'string' ? body.title.trim() : '';
	const validatedEditorState = validateEditorState(body.editorState);
	const version = Number(body.version);
	if (
		title.length < 1 ||
		title.length > 120 ||
		!Number.isSafeInteger(version) ||
		version < 1 ||
		validatedEditorState === null
	) {
		json(response, 200, { ok: false, message: 'The document payload is invalid' });
		return;
	}
	const plainText = validatedEditorState.plainText;
	const currentAtAcceptance = session.documents.get(documentId);
	if (version <= currentAtAcceptance.acceptedVersion) {
		json(response, 200, {
			ok: true,
			applied: false,
			savedAt: 'Save rejected',
			version: currentAtAcceptance.acceptedVersion,
		});
		return;
	}

	const failureKey = `${sessionId}:${documentId}:save`;
	if (url.searchParams.get('fault') === 'save' && !session.failures.has(failureKey)) {
		session.failures.add(failureKey);
		await delay(100);
		json(response, 200, { ok: false, message: 'Autosave paused. Try again when you are ready.' });
		return;
	}
	// Failed requests do not reserve a version. Successful requests reserve before
	// their delay so a newer save still wins when overlapping requests settle out of order.
	currentAtAcceptance.acceptedVersion = version;

	const milliseconds = /first slow draft/i.test(plainText)
		? 650
		: /second fast draft/i.test(plainText)
			? 55
			: 95;
	await delay(milliseconds);

	const current = session.documents.get(documentId);
	const applied = version === current.acceptedVersion && version > current.version;
	if (applied) {
		session.documents.set(documentId, {
			...current,
			title,
			editorState: body.editorState,
			updatedAt: 'Edited just now',
			version,
		});
	}
	const latest = session.documents.get(documentId);
	json(response, 200, {
		ok: true,
		applied,
		savedAt: 'Saved just now',
		version: latest.version,
	});
}

function serveAsset(pathname, response) {
	const candidate = path.resolve(distRoot, `.${pathname}`);
	if (!candidate.startsWith(`${distRoot}${path.sep}`) || !existsSync(candidate)) return false;
	const stats = statSync(candidate);
	if (!stats.isFile()) return false;
	const contentTypes = {
		'.css': 'text/css; charset=utf-8',
		'.js': 'text/javascript; charset=utf-8',
		'.svg': 'image/svg+xml',
		'.json': 'application/json; charset=utf-8',
	};
	response.writeHead(200, {
		'Content-Type': contentTypes[path.extname(candidate)] ?? 'application/octet-stream',
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
		if (pathname === '/api/documents' && request.method === 'GET') {
			await handleList(request, response);
			return;
		}
		const documentMatch = pathname.match(/^\/api\/documents\/([^/]+)$/);
		if (documentMatch !== null) {
			const documentId = decodeURIComponent(documentMatch[1] ?? '');
			if (request.method === 'GET') {
				await handleLoad(request, response, documentId);
				return;
			}
			if (request.method === 'PUT') {
				await handleSave(request, response, documentId);
				return;
			}
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
	console.log(`Pagecraft document server listening at http://${host}:${port}`);
});

async function close() {
	server.close();
	await vite?.close();
}

process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
