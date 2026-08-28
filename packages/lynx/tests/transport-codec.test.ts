import { describe, expect, it } from 'vitest';

import {
	decodeLynxTransportValue,
	encodeLynxTransportValue,
	localizeLynxHostValue,
} from '../src/core/transport-codec.js';

const NUL = '\u0000';

/** Encode and decode, which is the only thing the rest of Octane may do. */
function roundTrip(value: unknown): unknown {
	return decodeLynxTransportValue(encodeLynxTransportValue(value));
}

describe('Lynx transport codec', () => {
	// The receiver's whole reason for existing is that what it gets back is
	// ordinary local data. Everything else in this file is a way that could stop
	// being true.
	it('returns ordinary receiver-local data for an ordinary payload', () => {
		const message = {
			protocol: 1,
			renderer: 'lynx',
			type: 'commit',
			batch: { commands: [{ op: 'create', id: 4, props: { class: 'row', hidden: false } }] },
			empty: {},
			list: [1, 'two', true, null, [3, { four: 4 }]],
		};
		const decoded = roundTrip(message);
		expect(decoded).toEqual(message);
		expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
		expect(Object.getPrototypeOf((decoded as { batch: object }).batch)).toBe(Object.prototype);
		// The decoded value is a distinct tree, not the one that was handed in:
		// a codec that returned its input would pass every equality assertion
		// here and still hand the receiver a bridged value on device.
		expect(decoded).not.toBe(message);
	});

	// A worklet closure capture holds `undefined` before its first assignment.
	// Plain `JSON.stringify` drops the key, so the receiver sees an absent
	// property where the sender had a present one holding `undefined` — which is
	// a different program, silently.
	it('carries undefined as a present key rather than dropping it', () => {
		const decoded = roundTrip({ _c: { initialValue: undefined }, after: 1 }) as {
			_c: Record<string, unknown>;
			after: number;
		};
		expect('initialValue' in decoded._c).toBe(true);
		expect(decoded._c.initialValue).toBe(undefined);
		expect(decoded.after).toBe(1);
		expect(Object.keys(decoded._c)).toEqual(['initialValue']);
		expect(roundTrip([undefined, 1])).toEqual([undefined, 1]);
		expect((roundTrip([undefined, 1]) as unknown[]).length).toBe(2);
	});

	// The sentinel is a string, so a payload may contain it by coincidence. If
	// escaping is wrong in either direction a user string turns into `undefined`
	// or vice versa, which is the classic in-band signalling defect.
	it('round-trips a payload that spells the sentinel itself', () => {
		for (const spelling of [
			`${NUL}undefined`,
			`${NUL}${NUL}undefined`,
			`${NUL}`,
			`${NUL}${NUL}`,
			`${NUL}proto`,
			`${NUL}anything`,
			`undefined`,
		]) {
			expect(roundTrip(spelling)).toBe(spelling);
			expect(roundTrip({ at: spelling })).toEqual({ at: spelling });
			expect(roundTrip([[spelling]])).toEqual([[spelling]]);
			expect(roundTrip({ deep: { deeper: [spelling, undefined] } })).toEqual({
				deep: { deeper: [spelling, undefined] },
			});
		}
	});

	// The adversarial ordering for the escape family: a record carrying both the
	// literal escaped-proto spelling as a key and a real __proto__ key. Restoring
	// by renaming in place lets the first key's restoration land on the second's
	// still-encoded snapshot entry, losing one key and double-restoring the
	// other; the round-trip must instead keep both, each with its own value.
	it('round-trips a record whose keys collide with the proto escape family', () => {
		const source: Record<string, unknown> = {};
		source[`${NUL}proto`] = 'family';
		Object.defineProperty(source, '__proto__', {
			configurable: true,
			enumerable: true,
			value: 'realproto',
			writable: true,
		});
		source[`${NUL}${NUL}proto`] = `${NUL}str`;
		const decoded = roundTrip(source) as Record<string, unknown>;
		expect(decoded[`${NUL}proto`]).toBe('family');
		expect(Object.getOwnPropertyDescriptor(decoded, '__proto__')?.value).toBe('realproto');
		expect(decoded[`${NUL}${NUL}proto`]).toBe(`${NUL}str`);
		expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
		expect(Object.keys(decoded)).toHaveLength(3);
	});

	// `main-renderer.ts` deliberately keeps a spread `__proto__` as an own data
	// property rather than a prototype write, so the wire has to preserve that
	// decision rather than quietly making it again on the receiver's behalf.
	it('restores a __proto__ key as an own data property and pollutes nothing', () => {
		// A computed key, deliberately. `{ __proto__: v }` written out in source is
		// a prototype write and produces no property at all, which is the very
		// confusion this codec exists to keep off the wire — so the test must not
		// fall into it while claiming to check it.
		const decoded = roundTrip({ ['__proto__']: { polluted: true }, sibling: 1 }) as Record<
			string,
			unknown
		>;
		const descriptor = Object.getOwnPropertyDescriptor(decoded, '__proto__');
		expect(descriptor).toBeDefined();
		expect(descriptor?.value).toEqual({ polluted: true });
		expect(descriptor?.enumerable).toBe(true);
		expect('get' in (descriptor as object)).toBe(false);
		expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
		expect(decoded.sibling).toBe(1);
		expect(({} as { polluted?: unknown }).polluted).toBe(undefined);
		expect((Object.prototype as { polluted?: unknown }).polluted).toBe(undefined);
	});

	// The proto escape is itself a legal key, so it needs the same escape ladder
	// the sentinel has, or a payload using it collides with the escape.
	it('round-trips keys that collide with the proto escape', () => {
		for (const key of [`${NUL}proto`, `${NUL}${NUL}proto`, `${NUL}${NUL}${NUL}proto`]) {
			const decoded = roundTrip({ [key]: 'kept' }) as Record<string, unknown>;
			expect(Object.keys(decoded)).toEqual([key]);
			expect(decoded[key]).toBe('kept');
			expect(Object.getOwnPropertyDescriptor(decoded, '__proto__')).toBe(undefined);
		}
	});

	// JSON turns each of these into something else without saying so: a bigint
	// throws with a message naming no path, and the rest are dropped or written
	// as `null`. A loud refusal at the sender beats a quiet change at the
	// receiver, because only the sender still knows what the value was.
	it.each([
		['a bigint', { at: { deep: 1n } }, /at \$\.at\.deep is a bigint/],
		['NaN', { at: [Number.NaN] }, /at \$\.at\[0\] is NaN, which JSON would write as null/],
		['Infinity', { at: Number.POSITIVE_INFINITY }, /at \$\.at is Infinity/],
		['-Infinity', { at: Number.NEGATIVE_INFINITY }, /at \$\.at is -Infinity/],
		['a function', { at: () => 1 }, /at \$\.at is a function/],
		['a symbol', { at: Symbol('x') }, /at \$\.at is a symbol/],
		// No own enumerable keys to walk, so each of these would sail through the
		// escape pass and be rewritten by `JSON.stringify` alone.
		['a Date', { at: new Date(0) }, /at \$\.at is a Date, which JSON would rewrite/],
		['a Map', { at: new Map([['a', 1]]) }, /at \$\.at is a Map/],
		['a Set', { at: new Set([1]) }, /at \$\.at is a Set/],
		['a class instance', { at: new (class Widget {})() }, /at \$\.at is a Widget/],
	])('refuses to encode %s, naming where it is', (_label, value, message) => {
		expect(() => encodeLynxTransportValue(value)).toThrowError(message);
	});

	// The decoder is the last place that can notice a sender which was never
	// routed through the encoder — and on device that unencoded value is exactly
	// the bridged reference the receiver must not reflect on.
	it('refuses anything that is not this codec output', () => {
		expect(() => decodeLynxTransportValue({ type: 'commit' })).toThrowError(
			/received object where the wire carries a string/,
		);
		expect(() => decodeLynxTransportValue(null)).toThrowError(/received null/);
		expect(() => decodeLynxTransportValue(undefined)).toThrowError(/received undefined/);
		expect(() => decodeLynxTransportValue('not json')).toThrowError(/is not JSON/);
		expect(() => decodeLynxTransportValue('{"type":"commit"}')).toThrowError(/no codec envelope/);
		expect(() => decodeLynxTransportValue('[0]')).toThrowError(/no codec envelope/);
		expect(() => decodeLynxTransportValue('[2,{}]')).toThrowError(/unknown codec flags 2/);
	});

	// A generator rather than a list: escaping bugs live in the combinations —
	// an escaped key holding an escaped string inside an array inside an escaped
	// key — and those are exactly the cases nobody writes by hand.
	it('round-trips every combination of the interesting values, nested', () => {
		const leaves: unknown[] = [
			undefined,
			null,
			0,
			-1.5,
			'',
			'plain',
			`${NUL}undefined`,
			`${NUL}${NUL}undefined`,
			`${NUL}proto`,
			true,
		];
		const keys = ['plain', '__proto__', `${NUL}proto`, `${NUL}${NUL}proto`, `${NUL}undefined`];
		const cases: unknown[] = [...leaves];
		for (const key of keys) {
			for (const leaf of leaves) {
				cases.push({ [key]: leaf });
				cases.push({ [key]: [leaf, { [key]: leaf }] });
				cases.push([{ [key]: leaf }]);
			}
		}
		expect(cases.length).toBe(160);
		for (const value of cases) {
			const decoded = roundTrip(value);
			expect(decoded).toEqual(value);
			// `toEqual` treats a missing key and a key holding `undefined` as the
			// same thing, which is the exact distinction this codec exists to keep.
			expect(describeShape(decoded)).toBe(describeShape(value));
		}
	});

	// Whole-payload equality that, unlike `toEqual`, can see a dropped key and
	// the difference between an own `__proto__` and a prototype write.
	function describeShape(value: unknown): string {
		if (value === undefined) return 'undefined';
		if (value === null) return 'null';
		if (typeof value !== 'object') return `${typeof value}:${JSON.stringify(value)}`;
		if (Array.isArray(value)) return `[${value.map(describeShape).join(',')}]`;
		const record = value as Record<string, unknown>;
		const proto = Object.getPrototypeOf(record) === Object.prototype ? 'op' : 'other';
		const own = Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}=${describeShape(record[key])}`);
		return `{${proto}|${own.join(',')}}`;
	}

	// JSON has no back-references, so a shared subtree is expanded once per
	// reference. Nothing sends one today; development says so if that changes,
	// because the growth is multiplicative rather than linear.
	it('reports a payload that shares composites, in development', () => {
		const shared = { a: 1 };
		const diagnostics: Error[] = [];
		encodeLynxTransportValue({ few: [shared, shared] }, (error) => void diagnostics.push(error));
		expect(diagnostics).toEqual([]);

		const many = Array.from({ length: 40 }, () => shared);
		encodeLynxTransportValue({ many }, (error) => void diagnostics.push(error));
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.message).toMatch(/sharing 39 composite references/);
		// It is a diagnostic, not a fault: the payload still encodes, expanded.
		expect(roundTrip({ many })).toEqual({ many: Array.from({ length: 40 }, () => ({ a: 1 })) });
	});

	// The wire form is the contract between the two threads, and the acceptance
	// this slice is measured against is that bytes are unchanged modulo the
	// encoding. A clean payload is therefore exactly its own JSON, plus `[0,` and
	// `]` — no reordering, no rewriting, no added fields.
	it('writes a clean payload as its own JSON inside the envelope', () => {
		const message = { batch: { commands: [{ op: 'create', id: 4, props: { class: 'row' } }] } };
		expect(encodeLynxTransportValue(message)).toBe(`[0,${JSON.stringify(message)}]`);
	});

	// The flag is what lets decode be a single `JSON.parse` for the payloads that
	// need nothing undone. Getting it wrong in the `0` direction delivers an
	// escaped payload unrestored, so the receiver sees the sentinel as a string.
	it('marks a payload that needed escaping', () => {
		expect(JSON.parse(encodeLynxTransportValue({ a: undefined }))[0]).toBe(1);
		expect(JSON.parse(encodeLynxTransportValue({ ['__proto__']: 1 }))[0]).toBe(1);
		expect(JSON.parse(encodeLynxTransportValue({ a: `${NUL}x` }))[0]).toBe(1);
		expect(JSON.parse(encodeLynxTransportValue({ [`${NUL}proto`]: 1 }))[0]).toBe(1);
	});

	// A value that entered from outside the transport has no encoded form to
	// decode, so the codec is run in both directions on it. What has to come
	// back is a tree the caller owns outright: the engine keeps whatever it kept,
	// and nothing it still holds can reach the receiver afterwards.
	// A cycle is the one input a sender can hand this codec that has no encoding
	// at all. Plain `JSON.stringify` answers it with a named `TypeError`; a
	// recursive walk that does not notice answers with a `RangeError` carrying no
	// path, which is a worse diagnostic than the thing it replaced.
	it('names a cyclic value rather than exhausting the stack', () => {
		const direct: Record<string, unknown> = { name: 'root' };
		direct.self = direct;
		expect(() => encodeLynxTransportValue(direct)).toThrow(TypeError);
		expect(() => encodeLynxTransportValue(direct)).toThrow(/at \$\.self(\.self)* nests deeper/);

		// Reached through an array and at a distance, so the guard cannot be
		// passing only for the shape that sits immediately under the root.
		const parent: Record<string, unknown> = {};
		const child: Record<string, unknown> = { parent };
		parent.children = [child];
		expect(() => encodeLynxTransportValue({ tree: parent })).toThrow(/nests deeper/);
	});

	it('carries a payload nested as deep as the wire allows', () => {
		// One below the limit round-trips, so the guard is a ceiling on nesting
		// rather than a cap that a legitimate payload could run into. Built
		// iteratively: constructing it by recursion would prove nothing about the
		// codec and would hit the stack first.
		let deep: unknown = 'leaf';
		for (let level = 0; level < 500; level++) deep = { level: deep };
		const decoded = decodeLynxTransportValue(encodeLynxTransportValue(deep));
		let walked = decoded;
		for (let level = 0; level < 500; level++) walked = (walked as { level: unknown }).level;
		expect(walked).toBe('leaf');
	});

	it('hands back a tree disjoint from the value that entered', () => {
		const nested = { name: 'Ada' };
		const entered = { profile: nested, tags: ['a'] };
		const localized = localizeLynxHostValue(entered) as typeof entered;

		expect(localized).toEqual({ profile: { name: 'Ada' }, tags: ['a'] });
		expect(localized).not.toBe(entered);
		expect(localized.profile).not.toBe(nested);
		expect(localized.tags).not.toBe(entered.tags);

		nested.name = 'mutated';
		entered.tags.push('b');
		expect(localized).toEqual({ profile: { name: 'Ada' }, tags: ['a'] });
	});
});
