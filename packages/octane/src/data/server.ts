/**
 * Serve data contracts from any server that speaks `Request` and `Response`.
 * A handler is reachable only through its contract, which parses the input
 * before the handler runs and the output before it leaves, so a handler can
 * never see unvalidated input.
 */
import * as devalue from 'devalue';
import {
	DataError,
	parse,
	type DataReply,
	type DataRequest,
	type Read,
	type Write,
} from './contracts.js';

export interface DataCall {
	readonly request: Request;
	readonly signal: AbortSignal;
	/** The client's ID for this write; pass it to the store that deduplicates. Empty for a read. */
	readonly operationId: string;
	/** Run another read in process, under the same context. */
	read<I, O>(read: Read<I, O>, input: I): Promise<O>;
}

export interface DataHandler {
	readonly contract: Read<any, any> | Write<any, any>;
	readonly run: (input: any, call: any) => unknown;
}

export function handle<I, O, C = {}>(
	contract: Read<I, O> | Write<I, O>,
	run: (input: I, call: C & DataCall) => O | Promise<O>,
): DataHandler {
	return { contract, run };
}

/** A write may ask for at most this many reads back; the rest reload on their own. */
const MAX_REFRESH = 8;

function respond(status: number, reply: DataReply): Response {
	return new Response(devalue.stringify(reply), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

export function createDataHandler<C extends object = {}>(
	handlers: readonly DataHandler[],
	options: {
		/** Authenticate the request and return what handlers need, such as the viewer. */
		context?: (request: Request) => C | Promise<C>;
		/** Origins other than the request's own that may call this endpoint. */
		allowedOrigins?: readonly string[];
	} = {},
): (request: Request) => Promise<Response> {
	const byName = new Map<string, DataHandler>();
	for (const handler of handlers) {
		const { name } = handler.contract;
		if (byName.has(name)) throw new Error(`octane/data: two handlers are named "${name}"`);
		byName.set(name, handler);
	}

	async function run(
		kind: 'read' | 'write',
		name: unknown,
		input: unknown,
		call: C & DataCall,
	): Promise<unknown> {
		const handler = typeof name === 'string' ? byName.get(name) : undefined;
		if (!handler || handler.contract.kind !== kind) throw new DataError('not_found');
		const { contract } = handler;
		const parsed = contract.input ? await parse(contract.input, input) : undefined;
		const output = await handler.run(parsed, call);
		return contract.output ? parse(contract.output, output) : output;
	}

	return async (request) => {
		const origin = request.headers.get('origin');
		if (
			request.method !== 'POST' ||
			(origin !== null &&
				origin !== new URL(request.url).origin &&
				!options.allowedOrigins?.includes(origin))
		) {
			return respond(403, { ok: false, code: 'forbidden' });
		}
		try {
			const payload = devalue.parse(await request.text()) as DataRequest;
			const context = options.context ? await options.context(request) : ({} as C);
			const call: C & DataCall = {
				...context,
				request,
				signal: request.signal,
				operationId: payload.kind === 'write' ? String(payload.operationId ?? '') : '',
				read: (read, input) => run('read', read.name, input, call) as Promise<any>,
			};
			const value = await run(payload.kind, payload.name, payload.input, call);
			if (payload.kind !== 'write' || !Array.isArray(payload.refresh)) {
				return respond(200, { ok: true, value });
			}
			// The write has committed. A read that fails here is left for the client to reload.
			const refreshed = [];
			for (const item of payload.refresh.slice(0, MAX_REFRESH)) {
				try {
					const fresh = await run('read', item.name, item.input, call);
					refreshed.push({ name: item.name, input: item.input, value: fresh });
				} catch {}
			}
			return respond(200, { ok: true, value, refreshed });
		} catch (error) {
			if (error instanceof DataError) {
				const { code, data, issues } = error;
				return respond(code === 'invalid' ? 400 : 422, { ok: false, code, data, issues });
			}
			// Not a reply: the client must not read an unexpected failure as a refusal.
			return new Response(null, { status: 500 });
		}
	};
}
