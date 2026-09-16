import { InvalidServerFunctionPayloadError } from '../server-call.js';
import {
	decodeServerArguments,
	encodeServerResultFrame,
	serverResultLimits,
	validateServerCallBatch,
	type ServerCallBatchOptions,
	type ServerResultLimits,
} from '../server-rpc-protocol.js';
import { readServerResult } from '../server-rpc-stream-client.js';
import { createServerResultStream } from './rpc-stream.js';

export type { ServerCallBatchOptions } from '../server-rpc-protocol.js';

/** In-process calls keep their per-call authorization; there is no HTTP batch to collect. */
export function batchServerCalls<T>(options: ServerCallBatchOptions, callback: () => T): T {
	validateServerCallBatch(options);
	return callback();
}

export interface ServerBatchMember {
	id: number;
	hash: string;
	body: string;
}

/**
 * Finite independent reads only. Each member crosses the ordinary authorized
 * request boundary. Multi-yield subscriptions use their own demand-driven RPC.
 * At most 32 bounded single values can be ready; no unbounded per-channel queue.
 */
export function executeServerFunctionBatch(
	body: string,
	invoke: (member: ServerBatchMember, signal: AbortSignal) => Promise<Response>,
	options: ServerResultLimits & { signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
	const limits = serverResultLimits(options);
	let members: ServerBatchMember[];
	try {
		const envelope: unknown = JSON.parse(body);
		if (
			!Array.isArray(envelope) ||
			envelope.length !== 2 ||
			envelope[0] !== 1 ||
			!Array.isArray(envelope[1]) ||
			envelope[1].length === 0 ||
			envelope[1].length > 32
		) {
			throw new Error('Invalid batch');
		}
		members = envelope[1].map((member: unknown, id: number) => {
			if (
				!Array.isArray(member) ||
				member.length !== 3 ||
				member[0] !== id ||
				typeof member[1] !== 'string' ||
				!/^[a-f0-9]{8}$/.test(member[1]) ||
				typeof member[2] !== 'string'
			) {
				throw new Error('Invalid batch member');
			}
			decodeServerArguments(member[2]);
			return { id, hash: member[1], body: member[2] };
		});
	} catch (error) {
		throw new InvalidServerFunctionPayloadError(error);
	}
	const cancellation = new AbortController();
	const signal =
		options.signal === undefined
			? cancellation.signal
			: AbortSignal.any([options.signal, cancellation.signal]);
	async function* results() {
		const ready: [number, string, unknown][] = [];
		let wake: (() => void) | undefined;
		let remaining = members.length;
		let closed = false;
		// The outer stream declaration occupies frame zero. Member sequence is
		// assigned at delivery, not completion, so its actual envelope is bounded.
		let sequence = 1;
		for (const member of members) {
			void (async () => {
				const timeout = new AbortController();
				const memberSignal = AbortSignal.any([signal, timeout.signal]);
				const timer = setTimeout(
					() => timeout.abort(new DOMException('Server batch member timed out', 'TimeoutError')),
					limits.timeoutMs,
				);
				let abort!: () => void;
				const aborted = new Promise<never>((_, reject) => {
					abort = () => reject(memberSignal.reason);
					memberSignal.addEventListener('abort', abort, { once: true });
					if (memberSignal.aborted) abort();
				});
				let outcome: [number, string, unknown];
				try {
					const work = (async (): Promise<[number, string, unknown]> => {
						memberSignal.throwIfAborted();
						const response = await invoke(member, memberSignal);
						if (memberSignal.aborted) {
							void response.body?.cancel().catch(() => {});
							memberSignal.throwIfAborted();
						}
						if (!response.ok) {
							void response.body?.cancel().catch(() => {});
							return [
								member.id,
								response.headers.get('Octane-RPC-Outcome') === 'rejected'
									? 'rejected'
									: 'uncertain',
								`Server function failed with status ${response.status}`,
							];
						}
						const value = await readServerResult(response, { ...limits, signal: memberSignal });
						if (value !== null && typeof value === 'object' && Symbol.asyncIterator in value) {
							await (value as AsyncIterable<unknown>)[Symbol.asyncIterator]().return?.();
							throw new Error('Subscriptions cannot join a finite server-call batch');
						}
						return [member.id, 'value', value];
					})();
					outcome = await Promise.race([work, aborted]);
				} catch {
					outcome = [
						member.id,
						'uncertain',
						'Server batch member did not produce an authoritative result',
					];
				} finally {
					clearTimeout(timer);
					memberSignal.removeEventListener('abort', abort);
				}
				if (!closed) {
					ready.push(outcome);
					wake?.();
				}
			})();
		}
		try {
			while (remaining > 0) {
				if (ready.length === 0)
					await new Promise<void>((resolve) => {
						wake = resolve;
					});
				wake = undefined;
				while (ready.length > 0) {
					remaining--;
					let outcome = ready.shift()!;
					if (
						encodeServerResultFrame(sequence, { kind: 'value', value: outcome }).byteLength >
						limits.maxFrameBytes
					) {
						outcome = [outcome[0], 'uncertain', 'Server batch member exceeded its frame budget'];
					}
					sequence++;
					yield outcome;
				}
			}
		} finally {
			closed = true;
			cancellation.abort();
			ready.length = 0;
		}
	}
	return createServerResultStream(results(), {
		...limits,
		signal,
		cancel: () => cancellation.abort(),
	});
}
