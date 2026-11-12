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
		/** The Standard JSON Schema extension, which Zod 4.2+, ArkType and Valibot provide. */
		readonly jsonSchema?:
			{ readonly output: (options: { readonly target: string }) => unknown } | undefined;
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
	/** The property that holds a record's ID. The store reads it, and rewrites it when a server assigns one. */
	readonly key: string;
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
	key: keyof T & string = 'id' as keyof T & string,
): Entity<T> {
	const self: Entity<T> = {
		name,
		schema,
		key,
		id: (value) => String((value as Record<string, unknown>)[key]),
		from: (source) => ({ entity: self, source }),
	};
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
	/** Whether a store with `persist` saves this read's value. */
	readonly persist: boolean;
	/** Change it when a saved value would mean something else, such as a view's new rule. */
	readonly version: string;
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
	/** For a create whose server assigns the ID: where the ID is in the validated reply. */
	readonly serverId: ((output: Output) => string) | undefined;
	/** Where the written record is in the validated reply, so views take it without reloading. */
	readonly record: ((output: Output) => unknown) | undefined;
	/** The fields a native form submits, by name; a write without them takes no form POST. */
	readonly form: FormFields | undefined;
	readonly invalidates: readonly string[];
}

/**
 * How one submitted field becomes an input value. Each appears exactly once,
 * except a checkbox, which is `true` when present and `false` when absent.
 * - `text`: the string as submitted.
 * - `secret`: text that a refused submission never sends back to the page.
 * - `number`: a finite number.
 * - `boolean`: exactly `"true"` or `"false"`, as a hidden field writes it.
 */
export type FieldCodec = 'text' | 'secret' | 'number' | 'boolean' | 'checkbox';
export type FormFields = Readonly<Record<string, FieldCodec>>;

/** Which rows of a view to show: `limit` rows from position `offset` of its order. */
export interface ViewWindow {
	readonly offset?: number;
	readonly limit?: number;
}

/** A view's input: its parameters, if it declares any, and the window to show. */
export type ViewInput<P> = [P] extends [void] ? ViewWindow | void : P & ViewWindow;

/** Sort keys, most significant first. The entity's key breaks remaining ties. */
export type ViewOrder<T> = ReadonlyArray<readonly [keyof T & string, 'asc' | 'desc']>;

export interface ViewRule<T> {
	readonly of: Entity<T>;
	readonly where: (record: T, input: any) => boolean;
	/** The view's full order, including the key tiebreak. */
	readonly compare: (a: T, b: T) => number;
	/** Rows shown when the input names no `limit`. */
	readonly limit: number;
	/** The most rows one request may ask for; the server refuses more. */
	readonly max: number;
}

/**
 * A list defined by a rule over an entity, not by a server response. Its read
 * value is the window's rows. The handler serves `limit` records from position
 * `offset` of the view's order, filtered by its rule, and must sort exactly as
 * `order` says, comparing values as JavaScript's `<` does, then by the key.
 */
export interface View<P, T> extends Read<ViewInput<P>, T[]> {
	readonly view: ViewRule<T>;
}

function compareValues(a: unknown, b: unknown): number {
	if (a === b) return 0;
	if (a == null) return -1;
	if (b == null) return 1;
	const left = a instanceof Date ? a.getTime() : a;
	const right = b instanceof Date ? b.getTime() : b;
	return (left as any) < (right as any) ? -1 : (left as any) > (right as any) ? 1 : 0;
}

/** Validate every item, synchronously when every item's validator is. */
function arrayOf<T>(item: StandardSchema<unknown, T>): StandardSchema<unknown, T[]> {
	return {
		'~standard': {
			version: 1,
			vendor: 'octane',
			validate(value) {
				if (!Array.isArray(value)) return { issues: [{ message: 'Expected an array' }] };
				const results = value.map((entry) => item['~standard'].validate(entry));
				const collect = (settled: SchemaResult<T>[]): SchemaResult<T[]> => {
					const values: T[] = [];
					for (const result of settled) {
						if (result.issues) return { issues: result.issues };
						values.push(result.value);
					}
					return { value: values };
				};
				return results.some((result) => result instanceof Promise)
					? Promise.all(results).then(collect)
					: collect(results as SchemaResult<T>[]);
			},
			jsonSchema: item['~standard'].jsonSchema && {
				output: (options) => ({
					type: 'array',
					items: item['~standard'].jsonSchema!.output(options),
				}),
			},
		},
	};
}

const isCount = (value: unknown, min: number, max: number) =>
	value === undefined ||
	(Number.isInteger(value) && (value as number) >= min && (value as number) <= max);

/**
 * A list the store keeps right under every edit. It loads the window it shows
 * plus a margin, shares those records with every other view of the entity,
 * and evaluates `where` and `order` locally, so an edit moves a record into,
 * out of or across a view in the task that made it.
 *
 * Read one window with `store.read(view, { offset, limit })`; its snapshot's
 * `more` says whether rows follow. Read a growing list a page at a time with
 * `pages(store, view)` or `usePages(view)`, which joins the pages loaded so far
 * and adds the next with `loadMore()`.
 */
export function view<T, P = void>(options: {
	name: string;
	of: Entity<T>;
	input?: StandardSchema<unknown, P>;
	where?: (record: T, input: P) => boolean;
	order: ViewOrder<T>;
	limit?: number;
	max?: number;
	tags?: readonly string[];
	fresh?: number;
	keep?: number;
	expire?: number;
	persist?: boolean;
	version?: string;
}): View<P, T> {
	const { of, order, input: params, where: rule, limit: shown, max: most, ...rest } = options;
	const max = most ?? 500;
	const limit = Math.min(shown ?? 20, max);
	const compare = (a: T, b: T): number => {
		for (const [field, direction] of order) {
			const result = compareValues((a as any)[field], (b as any)[field]);
			if (result !== 0) return direction === 'asc' ? result : -result;
		}
		return compareValues(of.id(a), of.id(b));
	};
	const input: StandardSchema<unknown, ViewInput<P>> = {
		'~standard': {
			version: 1,
			vendor: 'octane',
			validate(value) {
				const { offset, limit: count, ...values } = (value ?? {}) as ViewWindow;
				if (!isCount(offset, 0, Number.MAX_SAFE_INTEGER) || !isCount(count, 0, max)) {
					return { issues: [{ message: `Expected a window of at most ${max} rows` }] };
				}
				const window = { offset: offset ?? 0, limit: count ?? limit };
				if (!params) return { value: window as ViewInput<P> };
				const result = params['~standard'].validate(values);
				const merge = (parsed: SchemaResult<P>): SchemaResult<ViewInput<P>> =>
					parsed.issues ? parsed : { value: { ...parsed.value, ...window } as ViewInput<P> };
				return result instanceof Promise ? result.then(merge) : merge(result);
			},
		},
	};
	return {
		...read({ ...rest, input, output: arrayOf(of.schema), entities: (rows) => of.from(rows) }),
		view: { of, where: rule ?? (() => true), compare, limit, max },
	};
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
	/** Set to false to keep a value out of persistent storage, such as one holding secrets. */
	persist?: boolean;
	/** Saved values from another version are discarded. */
	version?: string;
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
		persist: options.persist ?? true,
		version: options.version ?? '',
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
	/**
	 * The server assigns the new record's ID instead of using the operation ID.
	 * Until the reply names it, the record shows under the operation ID, and
	 * later writes to it wait; the store then sends them with the server's ID.
	 */
	serverId?: (output: Output) => string;
	/**
	 * Where the written record is in the reply. Views then take the server's
	 * record in place of reloading their windows.
	 */
	record?: (output: Output) => unknown;
	/**
	 * Accept this write as a native form POST with these fields, so its form
	 * works before hydration and without JavaScript. Any other field is refused.
	 */
	form?: { readonly [K in keyof Input & string]?: FieldCodec };
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
		serverId: options.serverId,
		record: options.record,
		form: options.form as FormFields | undefined,
		invalidates: options.invalidates ?? [],
	};
}

/**
 * What one event says the server did. `put` is a record as the server now
 * holds it, `remove` a record it deleted, `read` a read's whole new value,
 * such as a count, and `invalidates` marks reads with these tags or entity
 * names stale, for a change the event does not carry, such as a new row in a
 * list only the server can order.
 */
export type FeedChange =
	| { readonly put: Entity<any>; readonly value: unknown }
	| { readonly remove: Entity<any>; readonly id: string }
	| { readonly read: Read<any, any>; readonly input?: unknown; readonly value: unknown }
	| { readonly invalidates: readonly string[] };

export interface Feed<Params, Event> {
	readonly kind: 'feed';
	readonly name: string;
	readonly params: StandardSchema<unknown, Params> | undefined;
	readonly event: StandardSchema<unknown, Event>;
	readonly changes: (event: Event, params: Params) => FeedChange | readonly FeedChange[];
	/** Tags and entity names of the reads this feed keeps current; missed events mark them stale. */
	readonly covers: readonly string[];
}

/**
 * Server events that keep loaded values current. The store listens while a
 * component observes the feed, shares one connection among observers, and
 * applies each event's `changes` to every read that holds the records.
 *
 * When the store may have missed events, because the source reports a gap or
 * a connection without a cursor drops and comes back, it marks every read in
 * `covers` stale, and observed ones reload.
 */
export function feed<Event, Params = void>(options: {
	name: string;
	params?: StandardSchema<unknown, Params>;
	event: StandardSchema<unknown, Event>;
	changes: (event: Event, params: Params) => FeedChange | readonly FeedChange[];
	covers: readonly string[];
}): Feed<Params, Event> {
	return {
		kind: 'feed',
		name: options.name,
		params: options.params,
		event: options.event,
		changes: options.changes,
		covers: options.covers,
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

/** A request to listen to a feed, from just after `cursor` when the store has one. */
export interface FeedRequest {
	readonly name: string;
	readonly params: unknown;
	readonly cursor: string | null;
}

/**
 * One message from a feed's source. `event` is an event, `id` lets the store
 * drop a duplicate, and `cursor` is the position to resume from after it.
 * `gap` says events were missed, such as a cursor too old to resume from. An
 * empty frame says the connection is open.
 */
export interface FeedFrame {
	readonly event?: unknown;
	readonly id?: string;
	readonly cursor?: string;
	readonly gap?: boolean;
}

/**
 * Opens one connection to a feed. Frames arrive in order until the iterable
 * ends or throws; the store then connects again, from its cursor.
 */
export type Listener = (request: FeedRequest, signal: AbortSignal) => AsyncIterable<FeedFrame>;
