import type { ServerCallOptions } from './server-call.js';
import {
	loadResponseReader,
	post,
	responseReader,
	setServerCallBatcher,
} from './server-rpc-client.js';
import {
	ServerCallUncertainError,
	serverResultLimits,
	validateServerCallBatch,
	type ServerCallBatchOptions,
	type ServerResultLimits,
} from './server-rpc-protocol.js';

export const SERVER_BATCH_CONTENT_TYPE = 'application/x-octane-rpc-batch+ndjson';

export type { ServerCallBatchOptions } from './server-rpc-protocol.js';

export interface Member {
	hash: string;
	body: string;
	signal?: AbortSignal | undefined;
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
	// Calls collect only inside this callback, so apps that never batch never
	// load the collector.
	setServerCallBatcher(enqueueServerCall);
	const previous = collecting;
	collecting = { options: { ...options }, members: [] };
	try {
		return callback();
	} finally {
		collecting = previous;
	}
}

/** Called only after local argument encoding and abort validation. */
function enqueueServerCall(
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
	if (batch.members.length === 0) queueMicrotask(() => dispatch(batch));
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

function dispatch(batch: Batch): void {
	const members = batch.members.filter((member) => !member.settled);
	if (members.length === 0) return;
	const limits = serverResultLimits(batch.options);
	const transport = new AbortController();
	const timer = setTimeout(
		() => transport.abort(new DOMException('Server batch timed out', 'TimeoutError')),
		limits.timeoutMs,
	);
	const response = post(
		members[0]!.hash,
		JSON.stringify([1, members.map((member, id) => [id, member.hash, member.body])]),
		SERVER_BATCH_CONTENT_TYPE,
		transport.signal,
	);
	if (responseReader) {
		void responseReader.readServerBatch(members, response, limits, transport, timer);
		return;
	}
	// A request that fails before the reader arrives settles its members now.
	const fail = (error: unknown) => {
		clearTimeout(timer);
		transport.abort();
		rejectServerBatch(members, new ServerCallUncertainError(error));
	};
	let failed = false;
	response.catch((error) => {
		failed = true;
		fail(error);
	});
	loadResponseReader().then((module) => {
		if (!failed) void module.readServerBatch(members, response, limits, transport, timer);
	}, fail);
}

/** @internal Rejects every member that has not settled yet. */
export function rejectServerBatch(members: Member[], error: unknown): void {
	for (const member of members) {
		if (member.settled) continue;
		member.settled = true;
		member.dispose();
		member.reject(error);
	}
}
