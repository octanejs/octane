import * as devalue from 'devalue';
import {
	InvalidServerFunctionPayloadError,
	invokeServerFunction,
	type ServerCallContext,
} from '../server-call.js';
import { createServerResultStream } from './rpc-stream.js';
import {
	decodeServerArguments,
	serverResultLimits,
	type ServerResultLimits,
} from '../server-rpc-protocol.js';

function serverArguments(body: string): unknown[] {
	let args: unknown;
	try {
		args = devalue.parse(body);
	} catch (error) {
		throw new InvalidServerFunctionPayloadError(error);
	}
	if (!Array.isArray(args)) throw new InvalidServerFunctionPayloadError();
	return args;
}

/**
 * Execute a `module server` function for an RPC request. The wire format is
 * devalue on both sides (matching @ripple-ts/adapter's client stub, and chosen
 * over JSON so Dates/Maps/Sets/undefined/cycles round-trip): the request body
 * is a devalue-encoded argument array, the response a devalue-encoded
 * `{ value }` envelope. The metaframework loads this through the SSR module
 * graph (`ssrLoadModule('octane/server')`) so the executor and the resolved
 * server function share one runtime.
 */
export async function executeServerFunction(
	fn: Function,
	body: string,
	context?: ServerCallContext,
): Promise<string> {
	const args = serverArguments(body);
	const value = await invokeServerFunction(fn, args, context);
	return devalue.stringify({ value });
}

/** Opt-in result streaming; application authorization runs before this executor. */
export function executeServerFunctionStream(
	fn: Function,
	body: string,
	context?: ServerCallContext,
	limits?: ServerResultLimits,
): ReadableStream<Uint8Array> {
	const resolvedLimits = serverResultLimits(limits);
	let args: unknown[];
	try {
		args = decodeServerArguments(body);
	} catch (error) {
		throw new InvalidServerFunctionPayloadError(error);
	}
	const cancellation = new AbortController();
	const signal =
		context === undefined
			? cancellation.signal
			: AbortSignal.any([context.signal, cancellation.signal]);
	const trusted = context === undefined ? undefined : { ...context, signal };
	return createServerResultStream(
		Promise.resolve().then(() => {
			signal.throwIfAborted();
			return invokeServerFunction(fn, args, trusted);
		}),
		{ ...resolvedLimits, signal, cancel: () => cancellation.abort() },
	);
}
