import * as devalue from 'devalue';
import type {
	DataReply,
	DataRequest,
	FeedFrame,
	FeedRequest,
	Listener,
	Transport,
} from './contracts.js';

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

/**
 * Listen to feeds through a `module server` function that answers them with
 * `DataServer.listen`. Each connection is one streamed server call, under the
 * app's origin checks and middleware.
 */
export function serverListener(
	send: (
		request: string,
		options?: { signal?: AbortSignal },
	) => Promise<AsyncIterable<string>> | AsyncIterable<string>,
): Listener {
	return async function* (request, signal) {
		for await (const text of await send(devalue.stringify(request), { signal })) {
			yield devalue.parse(text) as FeedFrame;
		}
	};
}

/**
 * An async iterable over frames a callback source pushes. `start` begins the
 * connection and returns how to end it; it ends when the store aborts.
 */
function pushed(
	signal: AbortSignal,
	start: (push: (frame: FeedFrame) => void, end: (error?: unknown) => void) => () => void,
): AsyncIterable<FeedFrame> {
	return {
		async *[Symbol.asyncIterator]() {
			const queue: FeedFrame[] = [];
			let wake = () => {};
			let done = false;
			let failure: unknown;
			const end = (error?: unknown) => {
				if (done) return;
				done = true;
				failure = error;
				wake();
			};
			signal.addEventListener('abort', () => end(), { once: true });
			const stop = start((frame) => (queue.push(frame), wake()), end);
			try {
				while (true) {
					if (queue.length > 0) yield queue.shift()!;
					else if (done) {
						if (failure !== undefined) throw failure;
						return;
					} else await new Promise<void>((resolve) => (wake = resolve));
				}
			} finally {
				stop();
			}
		},
	};
}

/**
 * Listen to feeds over a WebSocket: one socket per feed connection, which
 * first sends the request, then reads one frame per message. By default it
 * speaks the protocol of `DataServer.accept`. For an existing socket service,
 * `encode` writes the message that subscribes, and `decode` reads a message
 * as a frame, or as null to skip it.
 */
export function webSocketListener(
	url: string | URL,
	options: {
		protocols?: string | string[];
		encode?: (request: FeedRequest) => string;
		decode?: (data: unknown) => FeedFrame | null;
		/** For a host with no global `WebSocket`. */
		WebSocket?: typeof WebSocket;
	} = {},
): Listener {
	const encode = options.encode ?? devalue.stringify;
	const decode = options.decode ?? ((data) => devalue.parse(String(data)) as FeedFrame);
	return (request, signal) =>
		pushed(signal, (push, end) => {
			const socket = new (options.WebSocket ?? WebSocket)(url, options.protocols);
			socket.addEventListener('open', () => {
				socket.send(encode(request));
				push({});
			});
			socket.addEventListener('message', (message) => {
				try {
					const frame = decode(message.data);
					if (frame) push(frame);
				} catch (error) {
					end(error);
				}
			});
			socket.addEventListener('error', () => end(new Error('octane/data: the feed socket failed')));
			socket.addEventListener('close', (event) =>
				end(
					event.wasClean
						? undefined
						: new Error(`octane/data: the feed socket closed (${event.code})`),
				),
			);
			return () => socket.close(1000);
		});
}

/**
 * Listen to feeds through a message broker the page already uses, such as
 * one over its own socket. `subscribe` delivers each message on `topic` and
 * returns how to stop. A message is the event unless `decode` reads it as a
 * frame, or as null to skip it. A broker without retained history has no
 * cursor, so when a dropped subscription comes back, the store reloads what
 * the feed covers.
 */
export function pubSubListener(
	subscribe: (topic: string, deliver: (message: unknown) => void) => () => void,
	options: {
		/** The topic for a feed connection; the feed's name by default. */
		topic?: (request: FeedRequest) => string;
		decode?: (message: unknown, request: FeedRequest) => FeedFrame | null;
	} = {},
): Listener {
	const topic = options.topic ?? ((request) => request.name);
	const decode = options.decode ?? ((message) => ({ event: message }));
	return (request, signal) =>
		pushed(signal, (push, end) => {
			const stop = subscribe(topic(request), (message) => {
				try {
					const frame = decode(message, request);
					if (frame) push(frame);
				} catch (error) {
					end(error);
				}
			});
			push({});
			return stop;
		});
}
