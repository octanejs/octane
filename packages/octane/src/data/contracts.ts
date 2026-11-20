/**
 * Data contracts: inert descriptions of a read or a write. Declaring or
 * importing one does no I/O, so a client, a server and a test can all import
 * the same module. A store (store.ts) runs them; a handler (server.ts) serves
 * them.
 */

import type { Implementation } from './server.js';

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
	/**
	 * One record, as an output schema. A read whose `output` it is selects the
	 * record, and a write to this entity whose `output` it is takes its reply
	 * as the saved record, with no `entities` or `record` to write.
	 */
	readonly one: StandardSchema<unknown, T>;
	/** A list of records, as an output schema. A read whose `output` it is selects every one. */
	readonly list: StandardSchema<unknown, T[]>;
}

/**
 * The function each contract declared with one serves it with, for
 * `defineHandler`. A client build of a `*.data.ts` module drops these
 * functions and the imports only they use, so none reaches the browser.
 */
export const served = new WeakMap<object, (input: any, call: any) => unknown>();

/**
 * A contract declared with the function that serves it. `Context` is what
 * that function needs from the handler's context; `defineHandler` serves it
 * only for a handler whose context provides it.
 */
export interface Served<Context> {
	readonly '~served': (context: Context) => void;
}

/** The entity each `one` and `list` schema holds, so a contract can select it without restating it. */
const holds = new WeakMap<object, Entity<any>>();

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
		// Its own object, not `schema`: an output of the plain schema keeps selecting nothing.
		one: { '~standard': schema['~standard'] },
		list: arrayOf(schema),
	};
	holds.set(self.one, self);
	holds.set(self.list, self);
	return self;
}

export interface Read<Input, Output> {
	readonly kind: 'read';
	readonly name: string;
	readonly input: StandardSchema<unknown, Input> | undefined;
	readonly output: StandardSchema<unknown, Output>;
	readonly entities: ((output: Output) => EntitySelection | EntitySelection[]) | undefined;
	/** Tags an invalidation names to mark this read stale, or the tags for one input. */
	readonly tags: Tags<Input>;
	/** Milliseconds a value is served without refetching. */
	readonly fresh: number;
	/** Milliseconds an unobserved value is retained. */
	readonly keep: number;
	/** Milliseconds after which a value is never shown. */
	readonly expire: number;
	/** Whether a store with `persist` saves this read's value. */
	readonly persist: boolean;
	/** Start a required live read alongside the first persistent restore. */
	readonly restore?: 'concurrent' | undefined;
	/** Whether a load is aborted once nothing observes the read or waits on it. */
	readonly cancel: boolean;
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
	/** Tags of the reads a confirmed write marks stale, or the tags for one input. */
	readonly invalidates: Tags<Input>;
}

/**
 * Tags as a list, or computed from an input: a read's input as it was passed
 * to `store.read`, a write's validated input. A read's tags are computed once
 * per input; a write's when it is sent and again when it settles.
 */
export type Tags<Input> = readonly string[] | ((input: Input) => readonly string[]);

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

/** Where a view's records point: under each name, the entity and the property that holds that record's ID. */
export type ViewRelations<T> = {
	readonly [name: string]: readonly [of: Entity<any>, key: keyof T & string];
};

/**
 * A row of a view `with` relations: the record, and under each relation's name
 * the record it points at. That is absent where the key is empty or the store
 * holds no such record.
 */
export type ViewRow<T, W> = {} extends W
	? T
	: T & {
			readonly [K in keyof W]?: W[K] extends readonly [Entity<infer R>, unknown] ? R : never;
		};

export interface ViewRule<T> {
	readonly of: Entity<T>;
	readonly where: (record: T, input: any) => boolean;
	/** The view's full order, including the key tiebreak. */
	readonly compare: (a: T, b: T) => number;
	/** Rows shown when the input names no `limit`. */
	readonly limit: number;
	/** The most rows one request may ask for; the server refuses more. */
	readonly max: number;
	/** The view's relations: the name each related record shows under, its entity, and the key. */
	readonly joins: ReadonlyArray<readonly [name: string, of: Entity<any>, key: string]>;
}

/**
 * A list defined by a rule over an entity, not by a server response. Its read
 * value is the window's rows, `R`: the records, each with the records it is
 * joined to. The handler serves `limit` records from position `offset` of the
 * view's order, filtered by its rule, and must sort exactly as `order` says,
 * comparing values as JavaScript's `<` does, then by the key.
 */
export interface View<P, T, R = T> extends Read<ViewInput<P>, R[]> {
	readonly view: ViewRule<T>;
}

/** @internal A joined row's own record: the row without its related records. */
export function recordOf(row: object, joins: ViewRule<any>['joins']): Record<string, unknown> {
	const record: Record<string, unknown> = {};
	for (const key of Object.keys(row))
		if (!joins.some(([name]) => name === key)) record[key] = (row as any)[key];
	return record;
}

/**
 * Validate a joined row's record and each related record with its own
 * entity's schema, so a schema that drops or refuses unknown keys can be used.
 */
function joinedRow<T>(of: Entity<T>, joins: ViewRule<T>['joins']): StandardSchema<unknown, any> {
	const schemas = [of.schema, ...joins.map(([, entity]) => entity.schema)];
	return {
		'~standard': {
			version: 1,
			vendor: 'octane',
			validate(value) {
				if (value === null || typeof value !== 'object')
					return { issues: [{ message: 'Expected a record' }] };
				const results = joins.map(([name, entity]) => {
					const related = (value as any)[name];
					// A key that points at nothing: the server sends no record, however it spells that.
					return related == null
						? { value: undefined }
						: entity.schema['~standard'].validate(related);
				});
				const record = of.schema['~standard'].validate(recordOf(value, joins));
				const collect = (
					parsed: SchemaResult<any>,
					settled: SchemaResult<any>[],
				): SchemaResult<any> => {
					if (parsed.issues) return parsed;
					const row = { ...parsed.value };
					for (let index = 0; index < joins.length; index++) {
						const result = settled[index]!;
						if (result.issues) return result;
						row[joins[index]![0]] = result.value;
					}
					return { value: row };
				};
				return record instanceof Promise || results.some((result) => result instanceof Promise)
					? Promise.all([record, Promise.all(results)]).then(([parsed, settled]) =>
							collect(parsed, settled),
						)
					: collect(record, results as SchemaResult<any>[]);
			},
			jsonSchema: schemas.every((schema) => schema['~standard'].jsonSchema)
				? {
						output: (options) => ({
							allOf: [of.schema['~standard'].jsonSchema!.output(options)],
							properties: Object.fromEntries(
								joins.map(([name, entity]) => [
									name,
									entity.schema['~standard'].jsonSchema!.output(options),
								]),
							),
						}),
					}
				: undefined,
		},
	};
}

function compareValues(a: unknown, b: unknown): number {
	if (a === b) return 0;
	if (a == null) return -1;
	if (b == null) return 1;
	const left = a instanceof Date ? a.getTime() : a;
	const right = b instanceof Date ? b.getTime() : b;
	// Values of different types never coerce: a pending create's string ID sorts after numbers.
	if (typeof left !== typeof right) return typeof left < typeof right ? -1 : 1;
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

/**
 * Refuse a window the server did not sort in the view's order. The store
 * places every row by that order, so a server sorting another way, such as
 * by a database collation, would show rows out of place and lose or repeat
 * them at a window's edges.
 */
function inOrder<T>(
	name: string,
	rows: StandardSchema<unknown, T[]>,
	compare: (a: T, b: T) => number,
): StandardSchema<unknown, T[]> {
	const check = (result: SchemaResult<T[]>): SchemaResult<T[]> => {
		if (result.issues) return result;
		const list = result.value;
		for (let index = 1; index < list.length; index++) {
			if (compare(list[index - 1]!, list[index]!) >= 0) {
				return {
					issues: [
						{
							message: `View "${name}": row ${index} is out of the view's order`,
							path: [index],
						},
					],
				};
			}
		}
		return result;
	};
	return {
		'~standard': {
			...rows['~standard'],
			validate(value) {
				const result = rows['~standard'].validate(value);
				return result instanceof Promise ? result.then(check) : check(result);
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
 * `pages(store, view)`, which joins the pages loaded so far and adds the next
 * with `loadMore()`; a component shows it with `usePages`.
 *
 * `with` joins each record to the records it points at:
 * `with: { author: [User, 'authorId'] }` gives every row an `author`. The
 * handler returns each row with its related records under those names, and
 * the store keeps them as shared records of their own entities, so an edit to
 * a user shows in every row that points at it. `where` and `order` see the
 * view's own record only. A row keeps its identity until its record or one of
 * its related records changes.
 */
interface ViewOptions<T, P, W> {
	name: string;
	of: Entity<T>;
	with?: W;
	input?: StandardSchema<unknown, P>;
	where?: (record: T, input: P) => boolean;
	order: ViewOrder<T>;
	limit?: number;
	max?: number;
	tags?: Tags<ViewInput<P>>;
	fresh?: number;
	keep?: number;
	expire?: number;
	persist?: boolean;
	restore?: 'concurrent';
	cancel?: boolean;
	version?: string;
}

export function view<T, P = void, const W extends ViewRelations<T> = {}>(
	options: ViewOptions<T, P, W>,
): View<P, T, ViewRow<T, W>>;
/** A view with the function that serves it: see `Served`. */
export function view<T, P = void, const W extends ViewRelations<T> = {}, Context = {}>(
	options: ViewOptions<T, P, W>,
	run: Implementation<Context, View<P, T, ViewRow<T, W>>>,
): View<P, T, ViewRow<T, W>> & Served<Context>;
export function view<T, P, W extends ViewRelations<T>>(
	options: ViewOptions<T, P, W>,
	run?: (input: any, call: any) => unknown,
): View<P, T, ViewRow<T, W>> {
	const {
		of,
		with: relations,
		order,
		input: params,
		where: rule,
		limit: shown,
		max: most,
		...rest
	} = options;
	const joins = Object.entries(relations ?? {}).map(
		([name, [entity, key]]) => [name, entity, key] as const,
	);
	const max = most ?? 500;
	const limit = Math.min(shown ?? 20, max);
	const compare = (a: T, b: T): number => {
		for (const [field, direction] of order) {
			const result = compareValues((a as any)[field], (b as any)[field]);
			if (result !== 0) return direction === 'asc' ? result : -result;
		}
		// The key's own value, as a database orders it: integer IDs put 9 before 10.
		return compareValues((a as any)[of.key], (b as any)[of.key]);
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
	return serve(run, {
		...read({
			...rest,
			input,
			output: inOrder<any>(
				options.name,
				joins.length > 0 ? arrayOf(joinedRow(of, joins)) : of.list,
				compare,
			),
			// A related entity is selected too, so a write to it or a tag naming it reaches the view.
			entities: (rows) => [
				of.from(rows),
				...joins.map(([name, entity]) => entity.from(rows.flatMap((row) => row[name] ?? []))),
			],
		}),
		view: { of, where: rule ?? (() => true), compare, limit, max, joins },
	});
}

function serve<T extends object>(
	run: ((input: any, call: any) => unknown) | undefined,
	contract: T,
): T {
	if (run) served.set(contract, run);
	return contract;
}

interface ReadOptions<Input, Output> {
	name: string;
	input?: StandardSchema<unknown, Input>;
	output: StandardSchema<unknown, Output>;
	entities?: (output: Output) => EntitySelection | EntitySelection[];
	tags?: Tags<Input>;
	fresh?: number;
	keep?: number;
	expire?: number;
	/** Set to false to keep a value out of persistent storage, such as one holding secrets. */
	persist?: boolean;
	/** Restore a cached value while starting a required live read, rather than waiting for storage. */
	restore?: 'concurrent';
	/**
	 * Abort a load when its last fetching subscriber leaves or pauses, unless a
	 * `prefetch` or `refresh` is waiting on it. The confirmed value stays.
	 * For a read that follows what a user types.
	 */
	cancel?: boolean;
	/** Saved values from another version are discarded. */
	version?: string;
}

export function read<Output, Input = void>(
	options: ReadOptions<Input, Output>,
): Read<Input, Output>;
/** A read with the function that serves it: see `Served`. */
export function read<Output, Input = void, Context = {}>(
	options: ReadOptions<Input, Output>,
	run: Implementation<Context, Read<Input, Output>>,
): Read<Input, Output> & Served<Context>;
export function read<Output, Input>(
	options: ReadOptions<Input, Output>,
	run?: (input: any, call: any) => unknown,
): Read<Input, Output> {
	return serve(run, {
		kind: 'read',
		name: options.name,
		input: options.input,
		output: options.output,
		entities:
			options.entities ?? (holds.get(options.output)?.from as Read<Input, Output>['entities']),
		tags: options.tags ?? [],
		fresh: options.fresh ?? 0,
		keep: options.keep ?? 300_000,
		expire: options.expire ?? Infinity,
		persist: options.persist ?? true,
		restore: options.restore,
		cancel: options.cancel ?? false,
		version: options.version ?? '',
	});
}

interface WriteOptions<Input, Output> {
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
	invalidates?: Tags<Input>;
}

export function write<Input, Output = unknown>(
	options: WriteOptions<Input, Output>,
): Write<Input, Output>;
/** A write with the function that serves it: see `Served`. */
export function write<Input, Output = unknown, Context = {}>(
	options: WriteOptions<Input, Output>,
	run: Implementation<Context, Write<Input, Output>>,
): Write<Input, Output> & Served<Context>;
export function write<Input, Output>(
	options: WriteOptions<Input, Output>,
	run?: (input: any, call: any) => unknown,
): Write<Input, Output> {
	const { creates, patches, removes } = options;
	return serve(run, {
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
		record:
			options.record ??
			(options.output === (creates ?? patches)?.one ? (output: Output) => output : undefined),
		form: options.form as FormFields | undefined,
		invalidates: options.invalidates ?? [],
	});
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
interface FeedOptions<Event, Params> {
	name: string;
	params?: StandardSchema<unknown, Params>;
	event: StandardSchema<unknown, Event>;
	changes: (event: Event, params: Params) => FeedChange | readonly FeedChange[];
	covers: readonly string[];
}

export function feed<Event, Params = void>(
	options: FeedOptions<Event, Params>,
): Feed<Params, Event>;
/** A feed with the function that serves it: see `Served`. */
export function feed<Event, Params = void, Context = {}>(
	options: FeedOptions<Event, Params>,
	run: Implementation<Context, Feed<Params, Event>>,
): Feed<Params, Event> & Served<Context>;
export function feed<Event, Params>(
	options: FeedOptions<Event, Params>,
	run?: (input: any, call: any) => unknown,
): Feed<Params, Event> {
	return serve(run, {
		kind: 'feed',
		name: options.name,
		params: options.params,
		event: options.event,
		changes: options.changes,
		covers: options.covers,
	});
}

/**
 * One request on the wire. A write carries the reads on screen it should
 * refresh. A `position` asks a feed for its cursor now, which its value is.
 */
export interface DataRequest {
	readonly kind: 'read' | 'write' | 'position';
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
 *
 * A read that learns its value in parts may call `preview` with each
 * provisional value, a whole value of the read's output, before it resolves.
 * Readers with no confirmed value see the newest one until the reply replaces
 * it. A wrapper that passes no `preview` on shows the reply alone.
 */
export type Transport = (
	request: DataRequest,
	signal: AbortSignal,
	preview?: (value: unknown) => void,
) => Promise<DataReply>;

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
