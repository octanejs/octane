import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

// Compress server-rendered HTML responses (brotli preferred, gzip fallback).
// Static assets are already precompressed by compressPublicAssets; this covers
// the per-request document they can't reach.
export default function htmlCompressPlugin(nitroApp) {
	const inner = nitroApp.fetch;
	nitroApp.fetch = async (req) => {
		const res = await inner(req);
		const type = res.headers.get('content-type') ?? '';
		if (!type.includes('text/html') || res.headers.has('content-encoding') || !res.body) {
			return res;
		}
		const accept = req.headers.get('accept-encoding') ?? '';
		const br = /\bbr\b/.test(accept);
		if (!br && !/\bgzip\b/.test(accept)) return res;
		const body = Buffer.from(await res.arrayBuffer());
		const compressed = br
			? brotliCompressSync(body, {
					params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
				})
			: gzipSync(body);
		const headers = new Headers(res.headers);
		headers.set('content-encoding', br ? 'br' : 'gzip');
		headers.set('content-length', String(compressed.length));
		headers.delete('etag');
		headers.append('vary', 'accept-encoding');
		return new Response(compressed, {
			status: res.status,
			statusText: res.statusText,
			headers,
		});
	};
}
