import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	nodeRequestToWebRequest,
	sendWebResponse,
	serveStaticFile,
} from '../../../packages/app-core/src/server/node-http.js';

// Use the app's generated production handler and the framework's Node static
// adapter; the small wrapper binds only to loopback and reports an ephemeral port.
const root = path.resolve(process.argv[2]);
const { handler } = await import(pathToFileURL(path.join(root, 'dist/server/entry.js')).href);
const server = createServer(async (request, response) => {
	let bodyBytes = 0;
	const write = response.write;
	const end = response.end;
	function count(chunk, encoding) {
		if (chunk === undefined || chunk === null || typeof chunk === 'function') return;
		bodyBytes +=
			typeof chunk === 'string'
				? Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : 'utf8')
				: chunk.byteLength;
	}
	response.write = function (chunk, encoding, callback) {
		count(chunk, encoding);
		return write.call(this, chunk, encoding, callback);
	};
	response.end = function (chunk, encoding, callback) {
		count(chunk, encoding);
		return end.call(this, chunk, encoding, callback);
	};
	response.on('finish', () =>
		process.send?.({
			request: {
				path: new URL(request.url, 'http://127.0.0.1').pathname,
				status: response.statusCode,
				contentEncoding: response.getHeader('content-encoding') ?? null,
				bodyBytes,
				headerBytes: Buffer.byteLength(response._header ?? ''),
			},
		}),
	);
	try {
		if (serveStaticFile(request, response, path.join(root, 'dist/client'))) return;
		await sendWebResponse(response, await handler(nodeRequestToWebRequest(request, response)));
	} catch (error) {
		console.error(error);
		if (!response.headersSent) response.writeHead(500);
		response.end();
	}
});
server.listen(0, '127.0.0.1', () => process.send?.({ port: server.address().port }));
