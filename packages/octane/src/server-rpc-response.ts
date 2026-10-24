import { parse } from 'devalue';
import {
	SERVER_BATCH_CONTENT_TYPE,
	rejectServerBatch,
	type Member,
} from './server-rpc-batch-client.js';
import { requestFailed } from './server-rpc-client.js';
import {
	SERVER_RESULT_CONTENT_TYPE,
	ServerCallUncertainError,
	type ResolvedServerResultLimits,
} from './server-rpc-protocol.js';
import { readServerResult } from './server-rpc-stream-client.js';

// Loaded by server-rpc-client.ts on a page's first server call, while that
// call's request is already in flight.

/** Settles one call; `limits` selects the streamed result protocol. */
export async function readServerResponse(
	pending: Promise<Response>,
	timer: ReturnType<typeof setTimeout> | undefined,
	deadline: number | undefined,
	limits: ResolvedServerResultLimits | undefined,
	signal: AbortSignal | undefined,
): Promise<unknown> {
	const stream = limits !== undefined;
	try {
		let response: Response;
		try {
			response = await pending;
		} catch (cause) {
			throw requestFailed(cause);
		}

		if (!response.ok) {
			let message = `Server function call failed with status ${response.status}`;
			// Unframed HTTP error bodies have no result budget or completion
			// contract. In the bounded protocol, status/outcome are sufficient;
			// cleanup cannot delay settlement or expose private server diagnostics.
			let body = '';
			if (stream) {
				try {
					void response.body?.cancel().catch(() => {});
				} catch {
					/* Preserve the authoritative HTTP outcome. */
				}
			} else {
				body = await response.text().catch(() => '');
			}
			if (body) {
				try {
					const parsed = JSON.parse(body);
					message = typeof parsed?.error === 'string' && parsed.error ? parsed.error : body;
				} catch {
					message = body;
				}
			}
			const error = Object.assign(new Error(message), { status: response.status });
			throw response.headers.get('Octane-RPC-Outcome') === 'rejected'
				? error
				: new ServerCallUncertainError(error);
		}
		if (stream) {
			if (response.headers.get('content-type')?.split(';', 1)[0] !== SERVER_RESULT_CONTENT_TYPE) {
				void response.body?.cancel().catch(() => {});
				throw new ServerCallUncertainError(
					new Error('The server does not support the requested result protocol'),
				);
			}
			const remaining = deadline! - Date.now();
			if (remaining <= 0) {
				void response.body?.cancel().catch(() => {});
				throw new ServerCallUncertainError(
					new DOMException('Server function timed out', 'TimeoutError'),
				);
			}
			// The reader inherits the same absolute deadline. For a returned iterable,
			// it retains the remaining timer after this first-frame call completes.
			return await readServerResult(response, { ...limits, timeoutMs: remaining, signal });
		}

		let body: string;
		try {
			body = await response.text();
		} catch (error) {
			throw new ServerCallUncertainError(error);
		}
		if (body === '') {
			throw new ServerCallUncertainError(
				new Error(
					'The server function endpoint returned an empty response. Is the Octane server running?',
				),
			);
		}
		try {
			return parse(body).value;
		} catch (error) {
			throw new ServerCallUncertainError(error);
		}
	} finally {
		clearTimeout(timer);
	}
}

/** Settles every member of one batch request. */
export async function readServerBatch(
	members: Member[],
	pending: Promise<Response>,
	limits: ResolvedServerResultLimits,
	transport: AbortController,
	timer: ReturnType<typeof setTimeout>,
): Promise<void> {
	let definitiveRejection = false;
	try {
		const response = await pending;
		if (
			!response.ok ||
			response.headers.get('content-type')?.split(';', 1)[0] !== SERVER_BATCH_CONTENT_TYPE
		) {
			definitiveRejection =
				!response.ok && response.headers.get('Octane-RPC-Outcome') === 'rejected';
			try {
				void response.body?.cancel().catch(() => {});
			} catch {
				/* Keep the original outcome. */
			}
			throw new Error('Server-call batching was rejected or is unavailable');
		}
		const result = await readServerResult(response, { ...limits, signal: transport.signal });
		if (result === null || typeof result !== 'object' || !(Symbol.asyncIterator in result)) {
			throw new Error('Invalid server batch result');
		}
		const seen = new Set<number>();
		for await (const frame of result as AsyncIterable<unknown>) {
			if (
				!Array.isArray(frame) ||
				frame.length !== 3 ||
				!Number.isSafeInteger(frame[0]) ||
				frame[0] < 0 ||
				frame[0] >= members.length ||
				seen.has(frame[0]) ||
				!['value', 'rejected', 'uncertain'].includes(frame[1]) ||
				(frame[1] !== 'value' && typeof frame[2] !== 'string')
			) {
				throw new Error('Invalid or duplicate server batch member');
			}
			seen.add(frame[0]);
			const member = members[frame[0]]!;
			if (member.settled) continue;
			member.settled = true;
			member.dispose();
			if (frame[1] === 'value') member.resolve(frame[2]);
			else {
				const error = new Error(frame[2]);
				member.reject(frame[1] === 'rejected' ? error : new ServerCallUncertainError(error));
			}
		}
		if (seen.size !== members.length) throw new Error('Server batch ended with missing members');
	} catch (error) {
		rejectServerBatch(
			members,
			definitiveRejection || error instanceof ServerCallUncertainError
				? error
				: new ServerCallUncertainError(error),
		);
	} finally {
		clearTimeout(timer);
		transport.abort();
	}
}
