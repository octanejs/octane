import type { ServerCallOptions } from './server-call.js';
import { readServerResult } from './server-rpc-stream-client.js';
import {
	ServerCallUncertainError,
	serverResultLimits,
	validateServerCallBatch,
	type ServerCallBatchOptions,
	type ServerResultLimits,
} from './server-rpc-protocol.js';

export const SERVER_BATCH_CONTENT_TYPE = 'application/x-octane-rpc-batch+ndjson';

export type { ServerCallBatchOptions } from './server-rpc-protocol.js';

interface Member {
	hash: string;
	body: string;
	signal?: AbortSignal;
	resolve(value: unknown): void;
	reject(error: unknown): void;
	dispose(): void;
	settled: boolean;
}

interface Batch {
	options: ServerCallBatchOptions;
	members: Member[];
}

// Only the synchronous callback is a collection scope. Never retain ambient
// ownership across await, or merge unrelated documents/accounts by a timer.
let collecting: Batch | undefined;

export function batchServerCalls<T>(options: ServerCallBatchOptions, callback: () => T): T {
	validateServerCallBatch(options);
	const previous = collecting;
	collecting = { options: { ...options }, members: [] };
	try {
		return callback();
	} finally {
		collecting = previous;
	}
}

/** @internal Called only after local argument encoding and abort validation. */
export function enqueueServerCall(
	hash: string,
	body: string,
	options: ServerCallOptions,
	limits?: ServerResultLimits,
): Promise<unknown> | undefined {
	const batch = collecting;
	// Explicit per-call limits are a different cancellation/budget policy.
	if (batch === undefined || limits !== undefined) return undefined;
	if (batch.members.length === 32) {
		collecting = { options: batch.options, members: [] };
		return enqueueServerCall(hash, body, options);
	}
	if (batch.members.length === 0)
		queueMicrotask(() => {
			void dispatch(batch);
		});
	return new Promise((resolve, reject) => {
		const abort = () => {
			if (member.settled) return;
			member.settled = true;
			member.dispose();
			// The shared request may already be executing. Cancellation detaches
			// this finite read; it never aborts a sibling or repeats the request.
			reject(new ServerCallUncertainError(options.signal?.reason));
		};
		const member: Member = {
			hash,
			body,
			signal: options.signal,
			resolve,
			reject,
			settled: false,
			dispose: () => options.signal?.removeEventListener('abort', abort),
		};
		options.signal?.addEventListener('abort', abort, { once: true });
		batch.members.push(member);
		if (options.signal?.aborted) abort();
	});
}

async function dispatch(batch: Batch): Promise<void> {
	const members = batch.members.filter((member) => !member.settled);
	if (members.length === 0) return;
	const limits = serverResultLimits(batch.options);
	const transport = new AbortController();
	let definitiveRejection = false;
	const timer = setTimeout(
		() => transport.abort(new DOMException('Server batch timed out', 'TimeoutError')),
		limits.timeoutMs,
	);
	try {
		// Keep batched calls on the page's origin even when its document base differs.
		const response = await fetch(
			new URL('/_$_ripple_rpc_$_/' + members[0]!.hash, globalThis.location.href).href,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: SERVER_BATCH_CONTENT_TYPE },
				body: JSON.stringify([1, members.map((member, id) => [id, member.hash, member.body])]),
				signal: transport.signal,
			},
		);
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
		for (const member of members) {
			if (member.settled) continue;
			member.settled = true;
			member.dispose();
			member.reject(
				definitiveRejection || error instanceof ServerCallUncertainError
					? error
					: new ServerCallUncertainError(error),
			);
		}
	} finally {
		clearTimeout(timer);
		transport.abort();
	}
}
