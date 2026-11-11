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
	type Transport,
	type View,
	type Write,
} from './contracts.js';
import {
	decodeForm,
	FORM_KEY,
	FORM_OPERATION,
	FORM_TOKEN,
	FORM_WRITE,
	issueMap,
	type FormSeed,
} from './form.js';
import type { ServerCallContext } from '../server-call.js';

/**
 * What a server integration knows of a request beyond the `Request` itself:
 * the viewer its middleware authenticated and its platform bindings. A server
 * call's context and a middleware `Context` both have this shape.
 */
export interface DataCaller {
	readonly viewer?: unknown;
	readonly platform?: unknown;
}

/** Serves HTTP requests, and the same contracts in process for a server render. */
export interface DataServer {
	(request: Request): Promise<Response>;
	/**
	 * A transport for a store that renders `request` on this server. Calls run
	 * in process, under the context `request` authenticates, with the same
	 * validation as a call over HTTP.
	 */
	transport(request: Request): Transport;
	/**
	 * Answer one store request sent through a `module server` function, as
	 * `serverTransport` encodes it. The call's request and signal stand in for
	 * an HTTP request's, so the same handlers serve both:
	 *
	 * ```tsrx
	 * module server {
	 *   export async function data(request: string, call: ServerCallContext) {
	 *     return handler.serve(request, call);
	 *   }
	 * }
	 * ```
	 */
	serve(request: string, call: ServerCallContext): Promise<string>;
	/**
	 * Call before rendering a page. Signs the page's forms for the request's
	 * account and, when the request is a form's native POST, runs its write.
	 * Middleware passes its context as `caller`, so `context` sees its viewer.
	 */
	forms(request: Request, caller?: DataCaller): Promise<FormSession>;
}

export interface FormSession {
	/** Send this instead of the page: a 303 back to the page once a submission is accepted. */
	readonly response: Response | null;
	/** The page's status: 200, or 400 or 403 when it shows a refused submission. */
	readonly status: number;
	/** Pass to the page's `createDataStore({ form })`, whose seed carries it to the browser. */
	readonly form: FormSeed;
}

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

/**
 * Pair a contract with the function that serves it; `call` carries the
 * request's context. A view's handler receives its parameters and the window
 * to serve, and returns that window's records in the view's order.
 */
export interface Handle<C> {
	<P, T>(
		contract: View<P, T>,
		run: (
			input: ([P] extends [void] ? {} : P) & { readonly offset: number; readonly limit: number },
			call: C & DataCall,
		) => T[] | Promise<T[]>,
	): DataHandler;
	<I, O>(
		contract: Read<I, O> | Write<I, O>,
		run: (input: I, call: C & DataCall) => O | Promise<O>,
	): DataHandler;
}

const handle: Handle<any> = (contract: DataHandler['contract'], run: DataHandler['run']) => ({
	contract,
	run,
});

/** Compare a submitted token in time independent of where it differs. */
function same(submitted: unknown, token: string): boolean {
	if (typeof submitted !== 'string' || submitted.length !== token.length) return false;
	let difference = 0;
	for (let i = 0; i < token.length; i++)
		difference |= submitted.charCodeAt(i) ^ token.charCodeAt(i);
	return difference === 0;
}

/** A write may ask for at most this many reads back; the rest reload on their own. */
const MAX_REFRESH = 8;

function respond(status: number, reply: DataReply): Response {
	return new Response(devalue.stringify(reply), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

/**
 * Options come first so the context type they produce types every handler:
 * `createDataHandler({ context }, (handle) => [handle(books, (input, call) => …)])`.
 */
export function createDataHandler<C extends object = {}>(
	options: {
		/** Authenticate the request and return what handlers need, such as the viewer. */
		context?: (request: Request, caller?: DataCaller) => C | Promise<C>;
		/** Origins other than the request's own that may call this endpoint. */
		allowedOrigins?: readonly string[];
		/** Signs form tokens. Required for `forms()`; keep it out of client code. */
		secret?: string;
		/** The account a request acts for. A form signed for one account is refused for another. */
		grant?: (context: C) => string;
	},
	define: (handle: Handle<C>) => readonly DataHandler[],
): DataServer {
	const byName = new Map<string, DataHandler>();
	for (const handler of define(handle)) {
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

	const contextFor = async (request: Request, caller?: DataCaller) =>
		options.context ? await options.context(request, caller) : ({} as C);

	function callFor(
		context: C,
		request: Request,
		operationId: string,
		signal = request.signal,
	): C & DataCall {
		const call: C & DataCall = {
			...context,
			request,
			signal,
			operationId,
			read: (read, input) => run('read', read.name, input, call) as Promise<any>,
		};
		return call;
	}

	const allowed = (request: Request) => {
		const origin = request.headers.get('origin');
		return (
			origin === null ||
			origin === new URL(request.url).origin ||
			!!options.allowedOrigins?.includes(origin)
		);
	};

	/** Answer one request. Anything but a reply means the outcome is unknown. */
	async function answer(
		payload: DataRequest,
		request: Request,
		server?: ServerCallContext,
	): Promise<DataReply> {
		try {
			const operationId = payload.kind === 'write' ? String(payload.operationId ?? '') : '';
			const context = await contextFor(request, server);
			const call = callFor(context, request, operationId, server?.signal);
			const value = await run(payload.kind, payload.name, payload.input, call);
			if (payload.kind !== 'write' || !Array.isArray(payload.refresh)) return { ok: true, value };
			// The write has committed. A read that fails here is left for the client to reload.
			const refreshed = [];
			for (const item of payload.refresh.slice(0, MAX_REFRESH)) {
				try {
					const fresh = await run('read', item.name, item.input, call);
					refreshed.push({ name: item.name, input: item.input, value: fresh });
				} catch {}
			}
			return { ok: true, value, refreshed };
		} catch (error) {
			if (!(error instanceof DataError)) throw error;
			return { ok: false, code: error.code, data: error.data, issues: error.issues };
		}
	}

	const serve = async (request: Request): Promise<Response> => {
		if (request.method !== 'POST' || !allowed(request)) {
			return respond(403, { ok: false, code: 'forbidden' });
		}
		try {
			// A refusal is an answer, not a transport failure: browsers log every 4xx fetch.
			return respond(200, await answer(devalue.parse(await request.text()), request));
		} catch {
			// Not a reply: the client must not read an unexpected failure as a refusal.
			return new Response(null, { status: 500 });
		}
	};
	let signing: Promise<CryptoKey> | undefined;
	/** An HMAC of the account, so a token is valid only for the account it was issued to. */
	async function sign(grant: string): Promise<string> {
		const { secret } = options;
		if (!secret) throw new Error('octane/data: forms() needs a `secret`');
		const encoder = new TextEncoder();
		signing ??= crypto.subtle.importKey(
			'raw',
			encoder.encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign'],
		);
		const mac = await crypto.subtle.sign('HMAC', await signing, encoder.encode(`form\n${grant}`));
		return btoa(String.fromCharCode(...new Uint8Array(mac)))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
	}

	async function forms(request: Request, caller?: DataCaller): Promise<FormSession> {
		const context = await contextFor(request, caller);
		const form: FormSeed = {
			token: await sign(options.grant?.(context) ?? ''),
			nonce: crypto.randomUUID(),
			outcome: null,
		};
		const type = request.headers.get('content-type') ?? '';
		const submitted =
			request.method === 'POST' &&
			(type.startsWith('application/x-www-form-urlencoded') ||
				type.startsWith('multipart/form-data'));
		const data = submitted ? await request.formData() : null;
		const name = data?.get(FORM_WRITE);
		if (!data || typeof name !== 'string') return { response: null, status: 200, form };

		const key = String(data.get(FORM_KEY) ?? '');
		const handler = byName.get(name);
		const fields = handler?.contract.kind === 'write' ? handler.contract.form : undefined;
		const decoded = fields ? decodeForm(fields, data) : undefined;
		try {
			if (!decoded) throw new DataError('not_found');
			if (!allowed(request) || !same(data.get(FORM_TOKEN), form.token)) {
				throw new DataError('forbidden');
			}
			if (decoded.issues.length > 0) throw new DataError('invalid', undefined, decoded.issues);
			const operation = data.get(FORM_OPERATION);
			const operationId =
				typeof operation === 'string' && operation.length > 0 && operation.length <= 200
					? operation
					: crypto.randomUUID();
			await run('write', name, decoded.input, callFor(context, request, operationId));
		} catch (error) {
			if (!(error instanceof DataError)) throw error;
			const values = decoded?.values ?? {};
			const outcome = {
				write: name,
				key,
				pending: false,
				values,
				issues: issueMap(error.issues),
				error: error.code,
			};
			return {
				response: null,
				status: error.code === 'forbidden' ? 403 : 400,
				form: { ...form, outcome },
			};
		}
		// Back to the page, now rendered with the write applied.
		const { pathname, search } = new URL(request.url);
		const response = new Response(null, { status: 303, headers: { location: pathname + search } });
		return { response, status: 303, form };
	}

	return Object.assign(serve, {
		transport:
			(request: Request): Transport =>
			(payload) =>
				answer(payload, request),
		forms,
		// devalue on both sides, as over HTTP: a server call carries only plain data.
		serve: async (request: string, call: ServerCallContext) =>
			devalue.stringify(await answer(devalue.parse(request), call.request, call)),
	});
}
