import * as devalue from 'devalue';
import type { DataReply, DataRequest, Transport } from './contracts.js';

/**
 * Send requests to a `createDataHandler` endpoint. The body is devalue on both
 * sides, like `module server` calls, so dates, maps and sets survive the wire.
 * A response that is not a reply, such as a proxy error page, rejects: the
 * store then treats a write's outcome as unknown instead of as refused.
 */
export function httpTransport(
	url: string,
	options: { fetch?: typeof fetch; headers?: Record<string, string> } = {},
): Transport {
	const send = options.fetch ?? fetch;
	return async (request: DataRequest, signal: AbortSignal): Promise<DataReply> => {
		const response = await send(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...options.headers },
			body: devalue.stringify(request),
			signal,
		});
		return devalue.parse(await response.text()) as DataReply;
	};
}

/**
 * Send requests through a `module server` function that answers them with
 * `DataServer.serve`. In the browser the compiler's stub sends each one as a
 * server call, under the app's origin checks and middleware; during a server
 * render the same call runs in process. A failed call rejects, so the store
 * treats a write's outcome as unknown.
 */
export function serverTransport(
	send: (request: string, options?: { signal?: AbortSignal }) => Promise<string>,
): Transport {
	return async (request: DataRequest, signal: AbortSignal): Promise<DataReply> =>
		devalue.parse(await send(devalue.stringify(request), { signal })) as DataReply;
}
