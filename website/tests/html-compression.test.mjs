import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Readable, pipeline } from 'node:stream';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { brotliDecompressSync, createBrotliDecompress, createGunzip, gunzipSync } from 'node:zlib';
import htmlCompressPlugin from '../nitro-html-compress.mjs';

const encoder = new TextEncoder();
const shell = '<html><body><main>Ready shell</main>';
const boundary = '<section>Resolved boundary 💚</section></body></html>';

function deferred() {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function bounded(promise, message) {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), 2_000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

function request(encoding, method = 'GET') {
	return new Request('https://octanejs.dev/', {
		method,
		headers: { 'accept-encoding': encoding },
	});
}

function handler(response) {
	const app = { fetch: async () => response };
	htmlCompressPlugin(app);
	return app.fetch;
}

function heldHtml() {
	let controller;
	let open = true;
	const cancelled = deferred();
	const body = new ReadableStream({
		start(source) {
			controller = source;
			source.enqueue(encoder.encode(shell));
		},
		cancel() {
			open = false;
			cancelled.resolve();
		},
	});
	return {
		response: new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
		cancelled: cancelled.promise,
		finish() {
			if (!open) return;
			open = false;
			controller.enqueue(encoder.encode(boundary));
			controller.close();
		},
		fail(error) {
			open = false;
			controller.error(error);
		},
		get active() {
			return open;
		},
	};
}

function decodedReader(response, encoding) {
	const decoder = encoding === 'br' ? createBrotliDecompress() : createGunzip();
	const body = Readable.toWeb(decoder);
	pipeline(Readable.fromWeb(response.body), decoder, () => {});
	return body.pipeThrough(new TextDecoderStream()).getReader();
}

for (const encoding of ['gzip', 'br']) {
	test(`${encoding} delivers a decoded HTML shell before a pending boundary settles`, async () => {
		const source = heldHtml();
		const pending = handler(source.response)(request(encoding));
		let reader;
		try {
			const response = await bounded(pending, 'Compression withheld the streaming response');
			assert.equal(response.headers.get('content-encoding'), encoding);
			reader = decodedReader(response, encoding);
			let html = '';
			while (html.length < shell.length) {
				const chunk = await bounded(reader.read(), 'Compression withheld the decoded HTML shell');
				assert.equal(chunk.done, false);
				html += chunk.value;
			}
			assert.equal(html, shell);
			assert.equal(source.active, true, 'The boundary must remain pending during shell delivery');
			source.finish();
			for (;;) {
				const chunk = await bounded(reader.read(), 'The resolved HTML response did not finish');
				if (chunk.done) break;
				html += chunk.value;
			}
			assert.equal(html, shell + boundary);
		} finally {
			source.finish();
			await reader?.cancel();
			await pending;
		}
	});

	test(`${encoding} preserves complete HTML bytes across split UTF-8 chunks`, async () => {
		const bytes = encoder.encode(shell + boundary);
		const body = new ReadableStream({
			start(controller) {
				for (let offset = 0; offset < bytes.length; offset += 2) {
					controller.enqueue(bytes.slice(offset, offset + 2));
				}
				controller.close();
			},
		});
		const response = await handler(
			new Response(body, { headers: { 'content-type': 'text/html' } }),
		)(request(encoding));
		const compressed = Buffer.from(await response.arrayBuffer());
		const decoded = encoding === 'br' ? brotliDecompressSync(compressed) : gunzipSync(compressed);
		assert.deepEqual(decoded, Buffer.from(bytes));
	});

	test(`${encoding} surfaces a failed server boundary through the response body`, async () => {
		const source = heldHtml();
		const pending = handler(source.response)(request(encoding));
		let reader;
		try {
			const response = await bounded(pending, 'Compression withheld the streaming response');
			reader = response.body.getReader();
			assert.equal((await bounded(reader.read(), 'The response did not start')).done, false);
			source.fail(new Error('Failed server boundary'));
			await assert.rejects(
				bounded(
					(async () => {
						while (!(await reader.read()).done) {}
					})(),
					'The response did not report its source failure',
				),
				/Failed server boundary/,
			);
		} finally {
			source.finish();
			await reader?.cancel().catch(() => {});
			await pending;
		}
	});

	test(`${encoding} reports a producer failure before any HTML output`, async () => {
		const body = new ReadableStream({
			start(controller) {
				controller.error(new Error('Failed before rendering'));
			},
		});
		const response = await handler(
			new Response(body, { headers: { 'content-type': 'text/html' } }),
		)(request(encoding));
		await assert.rejects(
			bounded(response.arrayBuffer(), 'The response did not report its early failure'),
			/Failed before rendering/,
		);
	});

	test(`${encoding} cancels the pending HTML producer when the client cancels`, async () => {
		const source = heldHtml();
		const pending = handler(source.response)(request(encoding));
		let reader;
		try {
			const response = await bounded(pending, 'Compression withheld the streaming response');
			reader = response.body.getReader();
			assert.equal((await bounded(reader.read(), 'The response did not start')).done, false);
			await reader.cancel('Client disconnected');
			await bounded(source.cancelled, 'The pending HTML producer was not cancelled');
			assert.equal(source.active, false);
		} finally {
			source.finish();
			await reader?.cancel();
			await pending;
		}
	});

	test(`${encoding} cancels a producer before its first HTML chunk is available`, async () => {
		const cancelled = deferred();
		let active = true;
		const body = new ReadableStream({
			cancel() {
				active = false;
				cancelled.resolve();
			},
		});
		const pending = handler(new Response(body, { headers: { 'content-type': 'text/html' } }))(
			request(encoding),
		);
		const response = await bounded(pending, 'Compression waited for the first HTML chunk');
		const reader = response.body.getReader();
		const first = reader.read();
		await reader.cancel('Client disconnected before rendering');
		assert.deepEqual(await bounded(first, 'The pending client read was not cancelled'), {
			value: undefined,
			done: true,
		});
		await bounded(cancelled.promise, 'The idle HTML producer was not cancelled');
		assert.equal(active, false);
	});

	test(`${encoding} applies backpressure while a large HTML response is unread`, async () => {
		const cancelled = deferred();
		let produced = 0;
		const body = new ReadableStream({
			pull(controller) {
				// This upstream source limits work ahead of the client. Reaching its
				// quota while the response is unread must not break the response.
				if (++produced > 8) {
					controller.error(new Error('Unread HTML exceeded the producer quota'));
					return;
				}
				controller.enqueue(encoder.encode(`<pre>${randomBytes(65_536).toString('base64')}</pre>`));
			},
			cancel() {
				cancelled.resolve();
			},
		});
		const response = await handler(
			new Response(body, { headers: { 'content-type': 'text/html' } }),
		)(request(encoding));
		const reader = response.body.getReader();
		try {
			await delay(100);
			const first = await bounded(reader.read(), 'The buffered HTML response did not start');
			assert.equal(first.done, false);
			assert.ok(first.value.byteLength > 0);
			await reader.cancel('Client disconnected without reading the large response');
			await bounded(cancelled.promise, 'The backpressured producer was not cancelled');
		} finally {
			await reader.cancel().catch(() => {});
		}
	});
}

test('compression preserves response metadata and removes stale representation headers', async () => {
	const headers = new Headers({
		'content-type': 'text/html',
		'content-length': String(encoder.encode(shell + boundary).length),
		etag: '"uncompressed"',
		vary: 'cookie',
		'cache-control': 'private',
	});
	headers.append('set-cookie', 'session=example; HttpOnly');
	headers.append('set-cookie', 'theme=dark; Path=/');
	const response = await handler(
		new Response(shell + boundary, {
			status: 202,
			statusText: 'Accepted',
			headers,
		}),
	)(request('gzip, br'));
	assert.equal(response.status, 202);
	assert.equal(response.statusText, 'Accepted');
	assert.equal(response.headers.get('content-encoding'), 'br');
	assert.equal(response.headers.get('content-length'), null);
	assert.equal(response.headers.get('etag'), null);
	assert.equal(response.headers.get('vary'), 'cookie, accept-encoding');
	assert.equal(response.headers.get('cache-control'), 'private');
	assert.deepEqual(response.headers.getSetCookie(), [
		'session=example; HttpOnly',
		'theme=dark; Path=/',
	]);
	await response.body.cancel();
});

for (const [name, body, init, encoding, method] of [
	['non-HTML', 'plain text', { headers: { 'content-type': 'text/plain' } }, 'br', 'GET'],
	[
		'already encoded',
		'encoded HTML',
		{ headers: { 'content-type': 'text/html', 'content-encoding': 'identity' } },
		'gzip',
		'GET',
	],
	['unsupported encoding', 'HTML', { headers: { 'content-type': 'text/html' } }, 'deflate', 'GET'],
	['204', null, { status: 204, headers: { 'content-type': 'text/html' } }, 'br', 'GET'],
	['205', null, { status: 205, headers: { 'content-type': 'text/html' } }, 'gzip', 'GET'],
	['304', null, { status: 304, headers: { 'content-type': 'text/html' } }, 'br', 'GET'],
	[
		'HEAD',
		'HTML',
		{ headers: { 'content-type': 'text/html', 'content-length': '4' } },
		'gzip',
		'HEAD',
	],
]) {
	test(`${name} responses retain their original body and headers`, async () => {
		const original = new Response(body, init);
		const headers = [...original.headers];
		const response = await handler(original)(request(encoding, method));
		assert.equal(response.status, original.status);
		assert.deepEqual([...response.headers], headers);
		assert.equal(await response.text(), body ?? '');
	});
}
