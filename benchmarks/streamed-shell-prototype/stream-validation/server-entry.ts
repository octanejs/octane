import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { renderToPipeableStream } from 'octane/server';
import { StreamedStaticShell } from '../../../packages/octane/tests/hydration/_fixtures/streamed-static-shell.tsrx';

type Message = 'next' | 'end';
type Session = {
	loads: number;
	errors: string[];
	chunks: string[];
	ended: boolean;
	send(message: Message): void;
};

const assetDirectory = resolve(process.argv[2]);
const sessions = new Map<string, Session>();
const server = createServer(async (request, response) => {
	const url = new URL(request.url!, 'http://localhost');
	if (url.pathname === '/favicon.ico') {
		response.writeHead(204).end();
		return;
	}
	if (url.pathname === '/metrics' || url.pathname === '/control') {
		const session = sessions.get(url.searchParams.get('case') ?? '');
		if (!session) {
			response.writeHead(404).end();
			return;
		}
		if (url.pathname === '/control') {
			const action = url.searchParams.get('action');
			if (request.method !== 'POST' || (action !== 'next' && action !== 'end')) {
				response.writeHead(400).end();
				return;
			}
			session.send(action);
		}
		response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
		response.end(
			JSON.stringify({
				loads: session.loads,
				errors: session.errors,
				chunks: session.chunks,
				ended: session.ended,
			}),
		);
		return;
	}
	if (url.pathname === '/') {
		const name = url.searchParams.get('case');
		if (!name || sessions.has(name)) {
			response.writeHead(400).end();
			return;
		}
		const queue: Message[] = [];
		let release: ((message: Message) => void) | undefined;
		const session: Session = {
			loads: 0,
			errors: [],
			chunks: [],
			ended: false,
			send(message) {
				if (release) {
					const notify = release;
					release = undefined;
					notify(message);
				} else queue.push(message);
			},
		};
		sessions.set(name, session);
		const next = () =>
			new Promise<Message>((accept) => {
				const message = queue.shift();
				if (message) accept(message);
				else release = accept;
			});
		async function* load() {
			session.loads++;
			yield 'A';
			if ((await next()) === 'next') yield 'B: streamed update';
			await next();
		}
		response.writeHead(200, {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
		});
		response.write('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root">');
		const stream = renderToPipeableStream(
			StreamedStaticShell,
			{ load, onCleanup() {} },
			{
				streamedSignals: { buildId: 'shell-build', documentId: 'shell-document' },
				onError(error) {
					session.errors.push(String(error));
				},
			},
		);
		stream.pipe({
			write(chunk) {
				const text = String(chunk);
				session.chunks.push(text);
				return response.write(text);
			},
			end() {
				session.ended = true;
				response.end('</div></body></html>');
			},
		});
		response.on('close', () => {
			if (!session.ended) stream.abort();
		});
		return;
	}
	const asset = resolve(assetDirectory, '.' + url.pathname);
	if (!asset.startsWith(assetDirectory + sep)) {
		response.writeHead(404).end();
		return;
	}
	try {
		const contents = await readFile(asset);
		response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
		response.end(contents);
	} catch {
		response.writeHead(404).end();
	}
});
server.listen(0, '127.0.0.1', () => {
	const address = server.address();
	if (address && typeof address === 'object') process.send?.({ port: address.port });
});
