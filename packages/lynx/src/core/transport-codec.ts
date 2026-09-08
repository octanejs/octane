/**
 * The Lynx transport's encoding boundary.
 *
 * ## Why this file exists
 *
 * `ContextProxy` transports generic Lynx values, not strings. A composite sent
 * through it can arrive in LepusNG as `LEPUS_TAG_LEPUS_REF`: a host-backed
 * engine value that answers `typeof`, reads, `Object.keys`, spread, and
 * `JSON.stringify`, but is not an ordinary receiver-realm object. On it,
 * `Reflect.ownKeys` throws, `Object(v) !== v`, and the prototype is `null`.
 * Reproduced on iOS and Android; see issue #152.
 *
 * Octane read those values with `Object.getOwnPropertyNames`, which performs
 * `ToObject` and therefore coerced the bridge value into something enumerable.
 * That accident was load-bearing for the whole native lifetime of the package.
 * Replacing it with the non-coercing `Reflect.ownKeys` removed the accident and
 * broke the renderer on device — the defect was never the new call, it was that
 * a bridged value reached receiver code at all.
 *
 * So the transport, and only the transport, owns materialization:
 *
 * - **`LynxValue`** — the generic native value algebra (`lynx_value`).
 * - **`LynxValueRef`** — a JS-visible native-backed composite, e.g. `LEPUS_REF`.
 * - **`LynxStructuredValue`** — data materialized into the receiving realm as
 *   ordinary arrays and objects.
 *
 * The invariant this module exists to hold: **a `LynxValueRef` never escapes
 * the transport layer.** Everything above the transport sees only
 * `LynxStructuredValue`.
 *
 * ## What this codec is responsible for, and what it is not
 *
 * It owns exactly the cases where `JSON` would **silently** change meaning:
 *
 * | value | what plain JSON does | what this does |
 * | --- | --- | --- |
 * | `undefined` | drops the key entirely | sentinel, key preserved |
 * | `NaN` / `±Infinity` | writes `null` | throws |
 * | `bigint` | throws, with an unhelpful message | throws, naming the path |
 * | function / symbol | drops the key entirely | throws |
 * | `__proto__` key | engine-dependent on parse | own data property, always |
 * | `Date` / `Map` / instance | rewritten or emptied silently | throws |
 *
 * The one lossiness it accepts rather than refuses is a `null` prototype, which
 * JSON cannot express and which `JSON.parse` returns as `Object.prototype`.
 * `host-props.ts` already treats both as the same ordinary bag, so the receiver
 * cannot tell, and refusing would reject `Object.create(null)` data that is
 * otherwise perfectly plain.
 *
 * `undefined` is not hypothetical: it is what a worklet closure capture holds
 * before its first assignment, and dropping the key turns a captured
 * `undefined` into an absent property.
 *
 * This is **not** a schema. Narrowing a payload to the command ABI — op
 * discriminants, ranges, lengths, references, shape — stays in `protocol.ts`,
 * which runs after decode on values this codec has already proved are ordinary
 * local data.
 *
 * ## Escaping
 *
 * Two escapes, both keyed on `U+0000`, which no engine treats specially and
 * which JSON represents exactly:
 *
 * - a string equal to `"\u0000undefined"` means `undefined`; any real string
 *   that starts with `U+0000` gains one more, and decode removes it. So a
 *   payload containing the sentinel spelling round-trips as itself.
 * - the key `__proto__` travels as `"\u0000proto"`, restored on decode through
 *   `Object.defineProperty` so it is an own data property on every engine
 *   rather than whatever that engine's `JSON.parse` decides. Real keys of the
 *   form `\u0000*proto` gain one more `U+0000`, symmetrically.
 *
 * ## Envelope
 *
 * The wire form is `[flags, payload]`. `flags` is `0` when nothing was escaped,
 * which is the overwhelmingly common case, and then decode is a single
 * `JSON.parse` with no walk of its own — the cost of the escape machinery is
 * paid only by payloads that actually use it. Four bytes buy that.
 */
import { LYNX_DEVELOPMENT } from './environment.js';

/** The generic native value algebra a Lynx host can carry. */
export type LynxValue = unknown;

/**
 * A JS-visible native-backed composite, such as LepusNG's `LEPUS_REF`. It is
 * not an ordinary receiver-realm object and must never leave the transport.
 */
export type LynxValueRef = object;

/** Data materialized into the receiving realm as ordinary arrays and objects. */
export type LynxStructuredValue = unknown;

const NUL = '\u0000';
const UNDEFINED_SENTINEL = `${NUL}undefined`;
const PROTO_KEY = '__proto__';
const ESCAPED_PROTO_KEY = `${NUL}proto`;

/** `\u0000+proto`, the family the proto escape has to stay clear of. */
function isProtoEscapeFamily(key: string): boolean {
	if (key.charCodeAt(0) !== 0) return false;
	let index = 1;
	while (key.charCodeAt(index) === 0) index++;
	return key.length - index === 5 && key.endsWith('proto');
}

function codecError(path: string, message: string): TypeError {
	return new TypeError(`Octane Lynx transport value at ${path} ${message}`);
}

/** Name a refused composite by its constructor, so the message says which kind. */
function describeConstructor(value: object): string {
	const name: unknown = (value as { constructor?: { name?: unknown } }).constructor?.name;
	return typeof name === 'string' && name.length > 0 ? name : 'non-plain object';
}

/**
 * How deep a payload may nest before the codec names it rather than recursing.
 *
 * `prepare` is recursive, so a cycle is unbounded depth from its point of view,
 * and without a limit it exhausts the stack — a `RangeError` with no path, which
 * is a worse diagnostic than the `TypeError` plain `JSON.stringify` would have
 * produced. An on-path `Set` would distinguish a true cycle from deep nesting,
 * but it costs an add and a delete per composite on the first-screen path, which
 * is the one walk this codec exists to keep cheap. A depth counter costs one
 * integer compare, names the path where it gave up, and is reached only by a
 * payload no receiver could use: nothing Octane sends nests past single digits,
 * and a hand-built value this deep is a defect either way.
 */
const MAX_PREPARE_DEPTH = 512;

interface PrepareState {
	escaped: boolean;
	/** Development only: every composite seen, to notice a DAG before JSON expands it. */
	readonly seen: Map<object, number> | null;
	aliases: number;
}

/**
 * Return `value` itself when it is already JSON-safe, and a rewritten mirror
 * only when something below it needed escaping.
 *
 * Copy-on-write matters here: a first-screen batch is tens of thousands of
 * nodes and essentially never contains an escape, so the common path walks the
 * tree once and allocates nothing.
 */
function prepare(value: unknown, path: string, state: PrepareState, depth = 0): unknown {
	switch (typeof value) {
		case 'string':
			if (value.charCodeAt(0) !== 0) return value;
			state.escaped = true;
			return NUL + value;
		case 'number':
			if (Number.isFinite(value)) return value;
			throw codecError(path, `is ${String(value)}, which JSON would write as null.`);
		case 'boolean':
			return value;
		case 'undefined':
			state.escaped = true;
			return UNDEFINED_SENTINEL;
		case 'bigint':
			throw codecError(path, 'is a bigint, which the Lynx wire does not carry.');
		case 'function':
			throw codecError(path, 'is a function, which JSON would drop silently.');
		case 'symbol':
			throw codecError(path, 'is a symbol, which JSON would drop silently.');
		default:
			break;
	}
	if (value === null) return null;

	if (depth >= MAX_PREPARE_DEPTH) {
		throw codecError(
			path,
			`nests deeper than ${MAX_PREPARE_DEPTH} levels, which is either a cycle or a structure the wire cannot carry.`,
		);
	}
	const composite = value as object;
	if (state.seen !== null) {
		const count = state.seen.get(composite);
		if (count === undefined) state.seen.set(composite, 1);
		else {
			state.seen.set(composite, count + 1);
			state.aliases++;
		}
	}

	if (Array.isArray(composite)) {
		let mirror: unknown[] | null = null;
		for (let index = 0; index < composite.length; index++) {
			const before = composite[index];
			const after = prepare(before, `${path}[${index}]`, state, depth + 1);
			if (mirror === null) {
				if (after === before) continue;
				mirror = composite.slice(0, index);
			}
			mirror.push(after);
		}
		return mirror ?? composite;
	}

	// Ordinary objects and arrays only. A `Date`, `Map`, `Set`, or class instance
	// has no own enumerable keys to walk, so it would pass through this function
	// untouched and then be rewritten by `JSON.stringify` — into an ISO string
	// via `toJSON`, or into `{}` — with the receiver given no way to notice. That
	// is the same shape of defect as the one this module exists to end, so it is
	// refused at the sender, which is the last place that still knows what the
	// value was.
	const prototype = Object.getPrototypeOf(composite);
	if (prototype !== Object.prototype && prototype !== null) {
		throw codecError(
			path,
			`is a ${describeConstructor(composite)}, which JSON would rewrite into something else.`,
		);
	}

	const record = composite as Record<string, unknown>;
	// One enumeration, reused for both the key rewrite and the value walk. The
	// keys have to be seen to be escaped, and no `JSON.stringify` replacer can
	// rename a key — it is handed the key but can only replace the value.
	const keys = Object.keys(record);
	let mirror: Record<string, unknown> | null = null;
	for (let index = 0; index < keys.length; index++) {
		const key = keys[index]!;
		const escapedKey =
			key === PROTO_KEY ? ESCAPED_PROTO_KEY : isProtoEscapeFamily(key) ? NUL + key : key;
		const before = record[key];
		const after = prepare(before, `${path}.${key}`, state, depth + 1);
		if (mirror === null) {
			if (escapedKey === key && after === before) continue;
			state.escaped = true;
			mirror = {};
			for (let earlier = 0; earlier < index; earlier++) {
				const done = keys[earlier]!;
				mirror[done] = record[done];
			}
		} else if (escapedKey !== key) {
			state.escaped = true;
		}
		mirror[escapedKey] = after;
	}
	return mirror ?? record;
}

/**
 * Undo `prepare`. Only ever called for a payload whose flags say it escaped.
 *
 * Depth-capped on the same terms as `prepare`, and for the same reason: this
 * recurses, and `JSON.parse` is happy to hand back a structure deeper than the
 * stack. Anything this codec encoded is already under the limit, so the branch
 * is reached only by a payload some other writer produced.
 */
function restore(value: unknown, depth = 0): unknown {
	if (typeof value === 'string') {
		if (value.charCodeAt(0) !== 0) return value;
		return value === UNDEFINED_SENTINEL ? undefined : value.slice(1);
	}
	if (value === null || typeof value !== 'object') return value;
	if (depth >= MAX_PREPARE_DEPTH) {
		throw new TypeError(
			`Octane Lynx transport received a payload nesting deeper than ${MAX_PREPARE_DEPTH} levels.`,
		);
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			value[index] = restore(value[index], depth + 1);
		}
		return value;
	}
	// Rebuilt rather than renamed in place: renaming while iterating lets an
	// early restoration land on a snapshot key the loop has not reached yet —
	// `"\u0000\u0000proto"` restores to `"\u0000proto"`, which is exactly the
	// escaped `__proto__` entry still pending — clobbering it and then
	// double-restoring the clobbered value. The escape is injective, so writing
	// each final name into a fresh record is order-independent by construction.
	const record = value as Record<string, unknown>;
	const rebuilt: Record<string, unknown> = {};
	for (const key of Object.keys(record)) {
		const restored = restore(record[key], depth + 1);
		if (key === ESCAPED_PROTO_KEY) {
			// Defined rather than assigned: `rebuilt.__proto__ = x` is a prototype
			// write on any engine whose `Object.prototype` still carries the
			// accessor, and this has to be an own data property on every engine.
			Object.defineProperty(rebuilt, PROTO_KEY, {
				configurable: true,
				enumerable: true,
				value: restored,
				writable: true,
			});
		} else if (isProtoEscapeFamily(key)) {
			rebuilt[key.slice(1)] = restored;
		} else {
			rebuilt[key] = restored;
		}
	}
	return rebuilt;
}

/**
 * How many aliased composites a payload may contain before development says so.
 *
 * JSON has no back-references, so a shared subtree is expanded once per
 * reference. None of the current senders produce one — measured across the
 * whole lynx suite at the four send sites — and a payload that started to would
 * grow multiplicatively rather than linearly, which is worth a diagnostic long
 * before it is worth a wire format that can express sharing.
 */
const ALIAS_REPORT_THRESHOLD = 32;

/**
 * Encode a message for delivery across the Lynx channel.
 *
 * @param onDiagnostic receives development-only findings that are not faults.
 */
export function encodeLynxTransportValue(
	value: LynxValue,
	onDiagnostic?: (error: Error) => void,
): string {
	const state: PrepareState = {
		escaped: false,
		seen: LYNX_DEVELOPMENT ? new Map<object, number>() : null,
		aliases: 0,
	};
	const payload = prepare(value, '$', state);
	if (LYNX_DEVELOPMENT && state.aliases >= ALIAS_REPORT_THRESHOLD && onDiagnostic !== undefined) {
		onDiagnostic(
			new Error(
				`Octane Lynx encoded a message sharing ${state.aliases} composite references; JSON has no back-references, so each is expanded once per reference.`,
			),
		);
	}
	return JSON.stringify([state.escaped ? 1 : 0, payload]);
}

/**
 * Decode a message delivered across the Lynx channel into receiver-local
 * ordinary data.
 *
 * Throws when handed anything but this codec's own output — including a live
 * composite, which is the shape that reaches here when a sender has not been
 * routed through {@link encodeLynxTransportValue}.
 */
export function decodeLynxTransportValue(text: LynxValue): LynxStructuredValue {
	if (typeof text !== 'string') {
		throw new TypeError(
			`Octane Lynx transport received ${text === null ? 'null' : typeof text} where the wire carries a string. An unencoded value may be a host-backed reference, which the receiver must never reflect on.`,
		);
	}
	let envelope: unknown;
	try {
		envelope = JSON.parse(text) as unknown;
	} catch (error) {
		throw new TypeError(
			`Octane Lynx transport received a payload that is not JSON: ${(error as Error).message}`,
		);
	}
	if (!Array.isArray(envelope) || envelope.length !== 2) {
		throw new TypeError('Octane Lynx transport received a payload with no codec envelope.');
	}
	const flags: unknown = envelope[0];
	if (flags !== 0 && flags !== 1) {
		throw new TypeError(`Octane Lynx transport received unknown codec flags ${String(flags)}.`);
	}
	return flags === 0 ? envelope[1] : restore(envelope[1]);
}

/**
 * Materialize a value that entered Octane from outside the transport.
 *
 * The engine lifecycle events — `__RenderPage`, `__UpdatePage`,
 * `__UpdateGlobalProps` — arrive on the same `ContextProxy` machinery as a
 * transport message, but their sender is the native engine, which cannot be
 * asked to encode. So they are the one inbound payload nobody has encoded, and
 * the invariant that a {@link LynxValueRef} never escapes the transport layer
 * would be false with that entry left open: everything downstream of it is
 * written for ordinary local data.
 *
 * Encoding and immediately decoding is the materializer. It is deliberately
 * this codec rather than a bare `JSON.parse(JSON.stringify(value))`, so that a
 * host-originated record lands in the same value domain as every other message
 * — `undefined` survives, `__proto__` becomes an own data property on every
 * engine rather than whichever one `JSON.parse` happens to produce, and a
 * `bigint` or non-finite number is named where it entered instead of failing
 * later at the send site that would have carried it.
 *
 * The residual is the `Array.isArray` dispatch, which decides array from object
 * here exactly as it already does in the tuple check this feeds — a value that
 * lied about being an array would have been rejected there too.
 */
export function localizeLynxHostValue(value: LynxValue): LynxStructuredValue {
	return decodeLynxTransportValue(encodeLynxTransportValue(value));
}
