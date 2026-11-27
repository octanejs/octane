/**
 * The text octane/data writes for a value it saves or sends: JSON where JSON
 * keeps the value exactly, which writes and reads several times faster than
 * devalue on a large list, and devalue for anything else. Devalue's text of an
 * object or array starts with `[`, and JSON's of an object with `{`, so
 * `decode` tells a saved value's two apart, including text from before JSON.
 */
import * as devalue from 'devalue';

/** Read a saved value's text, JSON or devalue. */
export function decode(text: string): unknown {
	return text.startsWith('{') ? JSON.parse(text) : devalue.parse(text);
}

/**
 * The start of a reply sent as JSON. JSON alone is not enough: a proxy's JSON
 * error page would then read as a reply, where it must reject.
 */
const JSON_REPLY = 'json\n';

/** A reply's or feed frame's text: JSON after `JSON_REPLY` where JSON keeps it exactly, devalue otherwise. */
export function encodeReply(reply: object): string {
	return jsonExact(reply, new Set())
		? JSON_REPLY + JSON.stringify(reply)
		: devalue.stringify(reply);
}

/** Read a reply or frame `encodeReply` or `devalue.stringify` wrote; anything else throws. */
export function decodeReply(text: string): unknown {
	return text.startsWith(JSON_REPLY)
		? JSON.parse(text.slice(JSON_REPLY.length))
		: devalue.parse(text);
}

/**
 * Whether `JSON.parse(JSON.stringify(value))` equals `value`, as devalue's
 * would: plain objects and arrays, each reached once, of strings, booleans,
 * null and finite numbers other than -0, and arrays with no other properties.
 * JSON would drop `undefined` (which a hole reads as) and a list's other
 * properties, write a Date as text, and copy a value reached twice.
 */
export function jsonExact(value: unknown, seen: Set<object>): boolean {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
	if (typeof value !== 'object' || seen.has(value)) return false;
	seen.add(value);
	const proto = Object.getPrototypeOf(value);
	if (proto === Array.prototype) {
		const array = value as unknown[];
		for (let index = 0; index < array.length; index++)
			if (!jsonExact(array[index], seen)) return false;
		// Holes failed above, so any further key is a property beside the items.
		return Object.keys(array).length === array.length;
	}
	if (proto !== Object.prototype) return false;
	for (const key in value)
		if (!jsonExact((value as Record<string, unknown>)[key], seen)) return false;
	return true;
}
