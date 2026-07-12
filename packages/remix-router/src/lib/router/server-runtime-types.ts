// Local type stub for the vendored instrumentation.ts's two type-only
// `../server-runtime/*` imports. The server runtime (createRequestHandler,
// cookies, sessions — react-router's framework-mode server) is out of scope
// for this binding; only these two names are referenced, in type positions.
// Shapes mirror react-router@7.18.1 lib/server-runtime/{data,server}.ts
// (RequestHandler simplified: the MiddlewareEnabled conditional collapses to
// its AppLoadContext arm — middleware typing is a framework-mode concern).
export interface AppLoadContext {
	[key: string]: unknown;
}

export type RequestHandler = (request: Request, loadContext?: AppLoadContext) => Promise<Response>;
