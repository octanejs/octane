import { Readable, pipeline } from 'node:stream';
import { createBrotliCompress, createGzip, constants } from 'node:zlib';

function compressedBody(stream) {
	const chunks = stream[Symbol.asyncIterator]();
	let cancelled = false;
	return new ReadableStream(
		{
			async pull(controller) {
				try {
					const chunk = await chunks.next();
					if (cancelled) return;
					if (chunk.done) controller.close();
					else controller.enqueue(chunk.value);
				} catch (error) {
					if (!cancelled) controller.error(error);
				}
			},
			cancel() {
				cancelled = true;
				// Stop the pipeline even when a read is waiting for its first chunk.
				stream.destroy();
			},
		},
		{ highWaterMark: 0 },
	);
}

// Compress server-rendered HTML responses (brotli preferred, gzip fallback).
// Static assets are already precompressed by compressPublicAssets; this covers
// the per-request document they can't reach.
export default function htmlCompressPlugin(nitroApp) {
	const inner = nitroApp.fetch;
	nitroApp.fetch = async (req) => {
		const res = await inner(req);
		const type = res.headers.get('content-type') ?? '';
		if (
			req.method === 'HEAD' ||
			!type.includes('text/html') ||
			res.headers.has('content-encoding') ||
			!res.body
		) {
			return res;
		}
		const accept = req.headers.get('accept-encoding') ?? '';
		const br = /\bbr\b/.test(accept);
		if (!br && !/\bgzip\b/.test(accept)) return res;
		// Flush each incoming SSR chunk so a pending boundary cannot hold back
		// the already-rendered shell inside the compressor.
		const compressed = br
			? createBrotliCompress({
					flush: constants.BROTLI_OPERATION_FLUSH,
					params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
				})
			: createGzip({ flush: constants.Z_SYNC_FLUSH });
		const body = compressedBody(compressed);
		// Pipeline forwards producer errors to the response body and cancellation
		// back to the producer. The Web stream observes errors; do not await EOF.
		pipeline(Readable.fromWeb(res.body), compressed, () => {});
		const headers = new Headers(res.headers);
		headers.set('content-encoding', br ? 'br' : 'gzip');
		headers.delete('content-length');
		headers.delete('etag');
		headers.append('vary', 'accept-encoding');
		return new Response(body, {
			status: res.status,
			statusText: res.statusText,
			headers,
		});
	};
}
