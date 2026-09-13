/** Trusted, request-local capabilities. None of these fields are RPC arguments. */
export interface ServerCallContext<Viewer = unknown> {
	readonly request: Request;
	readonly signal: AbortSignal;
	readonly viewer: Viewer;
	readonly platform?: unknown;
}

/** Local caller options; the compiler never serializes these into RPC arguments. */
export interface ServerCallOptions {
	signal?: AbortSignal;
}

export interface ServerFunctionTarget {
	readonly id: string;
	readonly module: string;
	readonly export: string;
}

/** The host must authorize each invocation inside its own async request store. */
export interface ServerCallHost {
	invoke<T>(
		target: ServerFunctionTarget,
		options: ServerCallOptions,
		execute: (context: ServerCallContext) => T,
	): T | Promise<T>;
}

export interface ServerCallContextSource {
	getStore(): ServerCallHost | undefined;
}

type CallerArguments<Args extends unknown[]> = Args extends [...infer Input, unknown]
	? [...Input, options?: ServerCallOptions]
	: never;

export type ServerFunction<Fn extends (...args: any[]) => any> = (
	...args: CallerArguments<Parameters<Fn>>
) => Promise<Awaited<ReturnType<Fn>>>;

interface RegisteredServerFunction {
	readonly fn: (...args: any[]) => unknown;
	readonly contextIndex: number;
	readonly target: ServerFunctionTarget;
}

// Metadata follows the actual server export through bundling and aliases. It is
// not a browser credential: only the host can supply a request context.
const SERVER_FUNCTION = Symbol.for('octane.server.function');
const SERVER_CALL_SOURCE = Symbol.for('octane.server.call-context');
const globals = globalThis as typeof globalThis & {
	[SERVER_CALL_SOURCE]?: ServerCallContextSource;
};

export class InvalidServerFunctionPayloadError extends Error {
	readonly code = 'OCTANE_INVALID_RPC_PAYLOAD';

	constructor(cause?: unknown) {
		super('Invalid server function arguments', { cause });
		this.name = 'InvalidServerFunctionPayloadError';
	}
}

/** @internal Host integration; the source contains no process-global request value. */
export function __setServerCallContextSource(source: ServerCallContextSource): void {
	globals[SERVER_CALL_SOURCE] = source;
}

function registration(fn: Function): RegisteredServerFunction | undefined {
	return (fn as Function & { [SERVER_FUNCTION]?: RegisteredServerFunction })[SERVER_FUNCTION];
}

/** @internal Compiler target for exports with a final ServerCallContext parameter. */
export function __registerServerFunction<Fn extends (...args: any[]) => any>(
	fn: Fn,
	contextIndex: number,
	target: ServerFunctionTarget,
): ServerFunction<Fn> {
	if (!Number.isSafeInteger(contextIndex) || contextIndex < 0) {
		throw new TypeError('Invalid server function context position');
	}
	const registered = Object.freeze({ fn, contextIndex, target: Object.freeze({ ...target }) });
	const callable = (...args: unknown[]) => {
		let options: ServerCallOptions | undefined;
		if (args.length === contextIndex + 1) {
			options = args.pop() as ServerCallOptions | undefined;
		}
		return __serverCall(callable, args, options);
	};
	Object.defineProperty(callable, SERVER_FUNCTION, { value: registered });
	return callable as ServerFunction<Fn>;
}

/**
 * @internal Call a registered export in-process with the same per-invocation
 * authorization as RPC. Returning/aliasing the export retains this wrapper.
 */
export async function __serverCall(
	fn: (...args: any[]) => unknown,
	args: unknown[],
	options: ServerCallOptions = {},
): Promise<unknown> {
	const registered = registration(fn);
	if (registered === undefined) {
		throw new TypeError('The server function is not registered');
	}
	if (
		options === null ||
		typeof options !== 'object' ||
		Object.keys(options).some((key) => key !== 'signal') ||
		(options.signal !== undefined && !(options.signal instanceof AbortSignal))
	) {
		throw new TypeError('Server function options accept only a local AbortSignal');
	}
	if (args.length > registered.contextIndex) {
		throw new InvalidServerFunctionPayloadError();
	}
	options.signal?.throwIfAborted();
	const host = globals[SERVER_CALL_SOURCE]?.getStore();
	if (host === undefined) {
		throw new Error('A contextual server function requires an active server request');
	}
	return host.invoke(registered.target, options, (context) =>
		invokeServerFunction(fn, args, context),
	);
}

/** @internal Used only after the host has authorized this particular invocation. */
export function invokeServerFunction(
	fn: Function,
	args: unknown[],
	context?: ServerCallContext,
): unknown {
	const registered = registration(fn);
	if (registered === undefined) return fn.apply(null, args);
	if (context === undefined) {
		throw new Error('A contextual server function requires trusted request context');
	}
	if (args.length > registered.contextIndex) {
		throw new InvalidServerFunctionPayloadError();
	}
	context.signal.throwIfAborted();
	const input = args.slice();
	while (input.length < registered.contextIndex) input.push(undefined);
	input.push(Object.freeze({ ...context }));
	return registered.fn.apply(null, input);
}
