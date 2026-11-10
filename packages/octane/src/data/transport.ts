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
