import type { IncomingMessage, ServerResponse, Server } from 'node:http';

/** Convert a Node.js IncomingMessage to a Web Request. */
export function nodeRequestToWebRequest(nodeRequest: IncomingMessage): Request;

/**
 * Pipe a Web Response to a Node.js ServerResponse, streaming chunk-by-chunk
 * (a streaming SSR body flushes as it renders).
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
 */
export function createNodeServer(
	handler: (request: Request) => Response | Promise<Response>,
	options?: { staticDir?: string },
): { listen: (port?: number) => Server; close: () => void };
