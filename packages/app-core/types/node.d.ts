import type { IncomingMessage, ServerResponse, Server } from 'node:http';

/**
 * Convert a Node.js IncomingMessage to a Web Request. Pass its response to
 * cancel request.signal on a disconnect until the response finishes, including
 * after the request body has been consumed. Without a response, cancellation
 * only covers interrupted request uploads.
 *
 * The URL is `http://` plus the Host header. With `trustProxy`, its scheme comes
 * from the first `X-Forwarded-Proto` entry when that is `http` or `https`, and
 * its host from the first `X-Forwarded-Host` entry when that is a plain
 * `host[:port]`; a malformed value keeps the direct connection's. The path and
 * query always come from the request. Enable it only when a trusted proxy
 * overwrites both headers.
 */
export function nodeRequestToWebRequest(
	nodeRequest: IncomingMessage,
	nodeResponse?: ServerResponse,
	options?: { trustProxy?: boolean },
): Request;

/**
 * Pipe a Web Response to a Node.js ServerResponse, streaming chunk-by-chunk
 * (a streaming SSR body flushes as it renders). A HEAD response ends with its
 * headers and cancels the body.
 *
 * Rejects when the body fails. If headers were already sent, the response has
 * been destroyed so the client sees an interrupted transfer; only report the
 * error. Otherwise the Web Response's headers were removed and the caller may
 * send its own error response.
 */
export function sendWebResponse(nodeResponse: ServerResponse, webResponse: Response): Promise<void>;

/**
 * Serve a static file from `staticDir` when the request path maps to one.
 * Vite's `/assets/*` and Rsbuild's `/static/*` hash-named output get immutable
 * caching; other files revalidate. Returns true when the request was handled.
 */
export function serveStaticFile(
	req: IncomingMessage,
	res: ServerResponse,
	staticDir: string,
): boolean;

/**
 * Minimal production HTTP server: static files from `staticDir` first (the
 * built client assets), then the fetch-style SSR handler. The default boot for
 * `node dist/server/entry.js` when octane.config.ts has no adapter.
 * `trustProxy` applies to each request as in `nodeRequestToWebRequest`.
 */
export function createNodeServer(
	handler: (request: Request) => Response | Promise<Response>,
	options?: { staticDir?: string; trustProxy?: boolean },
): { listen: (port?: number) => Server; close: () => void };
