import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { renderToPipeableStream } from 'octane/server';
import { Shell } from './Shell.tsrx';

type Session = {
	resolve(value: string): void;
	reject(error: Error): void;
	abort(): void;
	loads: number;
	errors: string[];
	chunks: string[];
	ended: boolean;
};

const assets = resolve(process.argv[2]);
const sessions = new Map<string, Session>();
const server = createServer(async (request, response) => {
	const url = new URL(request.url!, 'http://localhost');
	if (url.pathname === '/favicon.ico') {
		response.writeHead(204).end();
		return;
	}
	if (url.pathname === '/control' || url.pathname === '/evidence') {
		const session = sessions.get(url.searchParams.get('case') ?? '');
		if (!session) {
			response.writeHead(404).end();
			return;
		}
		if (url.pathname === '/control') {
			const action = url.searchParams.get('action');
			if (request.method !== 'POST') {
				response.writeHead(405).end();
				return;
			}
			if (action === 'resolve') session.resolve('ready');
			else if (action === 'reject') session.reject(new Error('session failed'));
			else if (action === 'abort') session.abort();
			else {
				response.writeHead(400).end();
				return;
			}
		}
		response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
		response.end(JSON.stringify(session));
		return;
	}
	if (url.pathname === '/') {
		const name = url.searchParams.get('case');
		if (!name || sessions.has(name)) {
			response.writeHead(400).end();
			return;
		}
		let resolveLoad!: (value: string) => void;
		let rejectLoad!: (error: Error) => void;
		const pending = new Promise<string>((resolve, reject) => {
			resolveLoad = resolve;
			rejectLoad = reject;
		});
		const session: Session = {
			resolve: resolveLoad,
			reject: rejectLoad,
			abort() {},
			loads: 0,
			errors: [],
			chunks: [],
			ended: false,
		};
		sessions.set(name, session);
		response.writeHead(200, {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
		});
		response.write('<!doctype html><html><head><meta charset="utf-8"></head><body>');
		const stream = renderToPipeableStream(
			Shell,
			{
				load: () => {
					session.loads++;
					return pending;
				},
			},
			{
				streamedSignals: { buildId: 'race-build', documentId: name },
				onError(error) {
					session.errors.push(String(error));
				},
			},
		);
		session.abort = () => stream.abort();
		stream.pipe({
			write(chunk) {
				const text = String(chunk);
				session.chunks.push(text);
				return response.write(text);
			},
			end() {
				session.ended = true;
				response.end('</body></html>');
			},
		});
		response.on('close', () => {
			if (!session.ended) stream.abort();
		});
		return;
	}
	const asset = resolve(assets, '.' + url.pathname);
	if (!asset.startsWith(assets + sep)) {
		response.writeHead(404).end();
		return;
	}
	try {
		response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
		response.end(await readFile(asset));
	} catch {
		if (!response.headersSent) response.writeHead(404);
		response.end();
	}
});
server.listen(0, '127.0.0.1', () => {
	const address = server.address();
	if (address && typeof address === 'object') process.send?.({ port: address.port });
});
