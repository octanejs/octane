/**
 * The one way a store reaches the shelf's handler. In the browser `data` is
 * the compiler's stub, which calls the server; during a server render it runs
 * in process, under the request the page renders.
 */
module server {
	import type { ServerCallContext } from 'octane/server';
	import { handler } from './server.ts';

	export async function data(request: string, call: ServerCallContext) {
		return handler.serve(request, call);
	}
}

import { data } from 'server';

export { data };
