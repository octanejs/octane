// Local type stub for vendored instrumentation.ts's type-only import from the
// unvendored framework request handler. In v8 middleware is always enabled, so
// request context is unconditionally a RouterContextProvider.
import type { RouterContextProvider } from './utils';

export type RequestHandler = (
	request: Request,
	loadContext?: RouterContextProvider,
) => Promise<Response>;
