import type { Context, Middleware } from '@octanejs/app-core';
import type { ServerResultLimits } from 'octane/server';

export interface ServerFunctionsOptions {
	/**
	 * The server build of each module that declares a `module server` block,
	 * keyed by the root-relative path the compiler named it by, such as
	 * `'/src/data.tsrx'`:
	 *
	 * ```ts
	 * import * as data from './data.tsrx';
	 * createServerFunctions({ modules: { '/src/data.tsrx': data } });
	 * ```
	 */
	modules: Record<string, Record<string, unknown>>;
	/** Run before every server function call, in process or over RPC, as app config middleware does. */
	middlewares?: Middleware[];
	/** Trust X-Forwarded-Proto/Host when deriving the request origin. */
	trustProxy?: boolean;
	/** Origins other than the request's own that may call server functions. */
	allowedOrigins?: readonly string[];
	/** The largest request body a call may send. */
	maxBodyBytes?: number;
	resultLimits?: ServerResultLimits;
}

export interface ServerFunctions {
	/**
	 * Answer a browser's call to a server function, with the same origin
	 * checks, body limit and middleware as an Octane app server. Returns `null`
	 * for any request that is not one.
	 */
	handle(request: Request, platform?: unknown): Promise<Response> | null;
	/**
	 * Answer any other request through the middleware. A server function that
	 * `respond` calls, such as one a page's server render reads, runs in process
	 * under the middleware's context.
	 */
	respond(
		request: Request,
		respond: (context: Context) => Response | Promise<Response>,
		platform?: unknown,
	): Promise<Response>;
}

/**
 * Serve `module server` functions from a Node server an Octane integration does
 * not own, under any bundler that compiles `.tsrx` for the server.
 */
export function createServerFunctions(options: ServerFunctionsOptions): ServerFunctions;
