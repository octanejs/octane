/**
 * What a data reply looks like on the wire. A client that asks gets JSON
 * where JSON keeps the reply exactly, and devalue otherwise. A client that
 * does not ask, such as a page from an earlier deploy, always gets devalue,
 * and a client reads devalue from a server that never sends JSON.
 */
import * as devalue from 'devalue';
import { describe, expect, it } from 'vitest';
import {
	httpTransport,
	read,
	serverTransport,
	type DataReply,
	type DataRequest,
	type StandardSchema,
} from '../src/data/index.js';
import { createDataHandler } from '../src/data/server.js';

const any: StandardSchema<unknown, any> = {
	'~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) },
};
const value = read({ name: 'value', input: any, output: any });
/** A read of `value` that answers with what `make(input)` builds. */
function handler(make: (input: string) => unknown) {
	return createDataHandler({}, (handle) => [handle(value, (input: string) => make(input))]);
}
const request = (input: string): DataRequest => ({ kind: 'read', name: 'value', input });

/** A handler and an HTTP transport to it that records the text of each reply. */
function overHttp(make: (input: string) => unknown) {
	const serve = handler(make);
	const replies: string[] = [];
	const transport = httpTransport('https://app.test/data', {
		fetch: async (url, init) => {
			const response = await serve(new Request(url as string, init));
			const text = await response.text();
			replies.push(text);
			return new Response(text, response);
		},
	});
	return { serve, replies, transport };
}

const signal = new AbortController().signal;
const cases: Array<[string, 'JSON' | 'devalue', () => object]> = [
	[
		'plain data',
		'JSON',
		() => ({ list: [{ id: 'a', n: 1.5, ok: true, none: null }], text: 'Ćwiczenia ✓' }),
	],
	['a Date', 'devalue', () => ({ at: new Date('2026-11-26T10:00:00Z') })],
	['an undefined property', 'devalue', () => ({ id: 'a', note: undefined })],
	['-0', 'devalue', () => ({ zero: -0 })],
	['NaN', 'devalue', () => ({ nan: NaN })],
	['a Map', 'devalue', () => ({ map: new Map([['a', 1]]) })],
	[
		'one object reached twice',
		'devalue',
		() => {
			const shared = { id: 'a' };
			return { first: shared, second: shared };
		},
	],
];

describe('octane/data replies on the wire', () => {
	it.each(cases)(
		'sends a reply holding %s as %s, which arrives exactly as it was',
		async (_, format, make) => {
			const { replies, transport } = overHttp(() => make());
			const reply = await transport(request('x'), signal);
			expect(reply).toStrictEqual({ ok: true, value: make() });
			const got = (reply as { value: any }).value;
			if ('second' in got) expect(got.second).toBe(got.first);
			if ('zero' in got) expect(Object.is(got.zero, -0)).toBe(true);
			if ('note' in got) expect('note' in got).toBe(true);
			expect(replies[0]!.startsWith('json\n') ? 'JSON' : 'devalue').toBe(format);
		},
	);

	it('sends devalue to a client that does not ask for JSON, as one from an earlier deploy', async () => {
		const serve = handler(() => ({ list: [{ id: 'a' }] }));
		const response = await serve(
			new Request('https://app.test/data', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: devalue.stringify(request('x')),
			}),
		);
		const text = await response.text();
		expect(text.startsWith('[')).toBe(true);
		expect(devalue.parse(text)).toEqual({ ok: true, value: { list: [{ id: 'a' }] } });
	});

	it('rejects a JSON body that is not a reply, such as a proxy’s error, as before', async () => {
		const transport = httpTransport('https://app.test/data', {
			fetch: async () => new Response('{"ok":false,"error":"Bad gateway"}', { status: 502 }),
		});
		await expect(transport(request('x'), signal)).rejects.toThrow();
	});

	it('reads the devalue reply of a server that never sends JSON', async () => {
		const old: DataReply = { ok: true, value: { list: [{ id: 'a' }] } };
		const transport = httpTransport('https://app.test/data', {
			fetch: async () => new Response(devalue.stringify(old)),
		});
		expect(await transport(request('x'), signal)).toEqual(old);
	});

	it('does the same through a server call', async () => {
		const serve = handler((input) => (input === 'date' ? { at: new Date(0) } : { list: [1, 2] }));
		const call = { request: new Request('https://app.test/'), signal } as never;
		const texts: string[] = [];
		const transport = serverTransport(async (text) => {
			const reply = await serve.serve(text, call);
			texts.push(reply);
			return reply;
		});
		expect(await transport(request('plain'), signal)).toEqual({
			ok: true,
			value: { list: [1, 2] },
		});
		expect(await transport(request('date'), signal)).toEqual({
			ok: true,
			value: { at: new Date(0) },
		});
		expect(texts.map((text) => text.slice(0, 5))).toEqual(['json\n', '[{"ok']);
		// A caller that does not ask gets devalue, and an older server's devalue is read.
		const plain = await serve.serve(devalue.stringify(request('plain')), call);
		expect(plain.startsWith('[')).toBe(true);
		const older = serverTransport(async () => devalue.stringify({ ok: true, value: 3 }));
		expect(await older(request('plain'), signal)).toEqual({ ok: true, value: 3 });
	});
});
