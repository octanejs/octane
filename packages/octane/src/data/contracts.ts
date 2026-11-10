/**
 * Data contracts: inert descriptions of a read or a write. Declaring or
 * importing one does no I/O, so a client, a server and a test can all import
 * the same module. A store (store.ts) runs them; a handler (server.ts) serves
 * them.
 */

/** The validator interface shared by Zod, Valibot, ArkType and others. */
export interface StandardSchema<Input = unknown, Output = Input> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (value: unknown) => SchemaResult<Output> | Promise<SchemaResult<Output>>;
		readonly types?: { readonly input: Input; readonly output: Output } | undefined;
	};
}

export interface SchemaIssue {
	readonly message: string;
	readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

type SchemaResult<Output> =
	| { readonly value: Output; readonly issues?: undefined }
	| { readonly issues: ReadonlyArray<SchemaIssue> };

/** A definitive refusal: the operation did not happen and must not be assumed to have. */
export class DataError extends Error {
	readonly code: string;
	readonly data: unknown;
	readonly issues: ReadonlyArray<SchemaIssue> | undefined;
	constructor(code: string, data?: unknown, issues?: ReadonlyArray<SchemaIssue>) {
		super(`octane/data: ${code}`);
		this.name = 'DataError';
		this.code = code;
		this.data = data;
		this.issues = issues;
	}
}

/**
 * Run a validator. A synchronous validator returns synchronously, so a write
 * can show its optimistic edit in the same task as the event that caused it.
 */
export function parse<T>(schema: StandardSchema<unknown, T>, value: unknown): T | Promise<T> {
	const result = schema['~standard'].validate(value);
	return result instanceof Promise ? result.then(unwrap) : unwrap(result);
}

function unwrap<T>(result: SchemaResult<T>): T {
	if (result.issues) throw new DataError('invalid', undefined, result.issues);
	return result.value;
}

/** Entities found in a read's output: one item, or the array that holds them. */
export interface EntitySelection<T = any> {
	readonly entity: Entity<T>;
	readonly source: T | readonly T[];
}

export interface Entity<T> {
	readonly name: string;
	readonly schema: StandardSchema<unknown, T>;
	readonly id: (value: T) => string;
	/** Mark where this entity appears in a read's output. */
	from(source: T | readonly T[]): EntitySelection<T>;
}

/**
 * A record with an identity. Reads that select it share its fields: a write
 * that patches, creates or removes one updates every cached copy.
 */
export function entity<T>(
	name: string,
	schema: StandardSchema<unknown, T>,
	id: (value: T) => string = (value) => (value as { id: string }).id,
): Entity<T> {
	const self: Entity<T> = { name, schema, id, from: (source) => ({ entity: self, source }) };
	return self;
}

export interface Read<Input, Output> {
	readonly kind: 'read';
	readonly name: string;
	readonly input: StandardSchema<unknown, Input> | undefined;
	readonly output: StandardSchema<unknown, Output>;
	readonly entities: ((output: Output) => EntitySelection | EntitySelection[]) | undefined;
	readonly tags: readonly string[];
	/** Milliseconds a value is served without refetching. */
	readonly fresh: number;
	/** Milliseconds an unobserved value is retained. */
	readonly keep: number;
	/** Milliseconds after which a value is never shown. */
	readonly expire: number;
}

export interface Write<Input, Output> {
	readonly kind: 'write';
	readonly name: string;
	readonly input: StandardSchema<unknown, Input>;
	readonly output: StandardSchema<unknown, Output> | undefined;
	/** The optimistic effect on every cached copy of an entity. */
	readonly effect:
		{ readonly kind: 'create' | 'patch' | 'remove'; readonly entity: Entity<any> } | undefined;
	/** The optimistic row for a create; defaults to the input plus the new ID. */
	readonly draft: ((input: Input, id: string) => unknown) | undefined;
	readonly invalidates: readonly string[];
}

export function read<Output, Input = void>(options: {
	name: string;
	input?: StandardSchema<unknown, Input>;
	output: StandardSchema<unknown, Output>;
	entities?: (output: Output) => EntitySelection | EntitySelection[];
	tags?: readonly string[];
	fresh?: number;
	keep?: number;
	expire?: number;
}): Read<Input, Output> {
	return {
		kind: 'read',
		name: options.name,
		input: options.input,
		output: options.output,
		entities: options.entities,
		tags: options.tags ?? [],
		fresh: options.fresh ?? 0,
		keep: options.keep ?? 300_000,
		expire: options.expire ?? Infinity,
	};
}

export function write<Input, Output = unknown>(options: {
	name: string;
	input: StandardSchema<unknown, Input>;
	output?: StandardSchema<unknown, Output>;
	creates?: Entity<any>;
	patches?: Entity<any>;
	removes?: Entity<any>;
	draft?: (input: Input, id: string) => unknown;
	invalidates?: readonly string[];
}): Write<Input, Output> {
	const { creates, patches, removes } = options;
	return {
		kind: 'write',
		name: options.name,
		input: options.input,
		output: options.output,
		effect: creates
			? { kind: 'create', entity: creates }
			: patches
				? { kind: 'patch', entity: patches }
				: removes
					? { kind: 'remove', entity: removes }
					: undefined,
		draft: options.draft,
		invalidates: options.invalidates ?? [],
	};
}

/** One request on the wire. A write carries the reads on screen it should refresh. */
export interface DataRequest {
	readonly kind: 'read' | 'write';
	readonly name: string;
	readonly input: unknown;
	readonly operationId?: string;
	readonly refresh?: ReadonlyArray<{ readonly name: string; readonly input: unknown }>;
}

export type DataReply =
	| {
			readonly ok: true;
			readonly value: unknown;
			readonly refreshed?: ReadonlyArray<{
				readonly name: string;
				readonly input: unknown;
				readonly value: unknown;
			}>;
	  }
	| {
			readonly ok: false;
			readonly code: string;
			readonly data?: unknown;
			readonly issues?: ReadonlyArray<SchemaIssue> | undefined;
	  };

/**
 * Carries one request to wherever its handler runs. Resolving with a reply is
 * definitive. Rejecting means the outcome is unknown: a write may have landed.
 */
export type Transport = (request: DataRequest, signal: AbortSignal) => Promise<DataReply>;
