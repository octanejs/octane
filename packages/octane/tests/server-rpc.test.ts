import { describe, it, expect } from 'vitest';
import * as devalue from 'devalue';
import { executeServerFunction } from 'octane/server';

// The dev RPC executor the vite plugin loads via ssrLoadModule('octane/server').
// Wire format is devalue on both sides, mirroring @ripple-ts/adapter's client
// stub: request body = devalue.stringify(args), response = devalue-encoded
// { value } envelope read as devalue.parse(text).value.

function clientCall(args: unknown[]) {
	return devalue.stringify(args);
}
function clientRead(response: string) {
	return devalue.parse(response).value;
}

describe('executeServerFunction', () => {
	it('applies the decoded argument array and returns the { value } envelope', async () => {
		const add = (a: number, b: number) => a + b;
		const response = await executeServerFunction(add, clientCall([2, 40]));
		expect(clientRead(response)).toBe(42);
	});

	it('awaits async server functions', async () => {
		const fn = async (name: string) => `hi ${name}`;
		const response = await executeServerFunction(fn, clientCall(['octane']));
		expect(clientRead(response)).toBe('hi octane');
	});

	it('round-trips rich values JSON cannot represent', async () => {
		const echo = (v: unknown) => v;
		const payload = {
			when: new Date(0),
			tags: new Map([['a', 1]]),
			set: new Set([1, 2]),
			missing: undefined,
		};
		const response = await executeServerFunction(echo, clientCall([payload]));
		const out = clientRead(response) as typeof payload;
		expect(out.when).toBeInstanceOf(Date);
		expect(out.when.getTime()).toBe(0);
		expect(out.tags).toBeInstanceOf(Map);
		expect(out.tags.get('a')).toBe(1);
		expect(out.set).toBeInstanceOf(Set);
		expect('missing' in out && out.missing === undefined).toBe(true);
	});

	it('propagates a thrown server error as a rejection', async () => {
		const boom = () => {
			throw new Error('nope');
		};
		await expect(executeServerFunction(boom, clientCall([]))).rejects.toThrow('nope');
	});

	it('is NOT plain-JSON compatible (the devalue graph format is intentional)', async () => {
		const first = (...args: unknown[]) => args.length;
		const response = await executeServerFunction(first, clientCall([1, 2]));
		expect(clientRead(response)).toBe(2);
		// A JSON.parse of the same body would mis-split the indexed graph into
		// the wrong argument count; pin that the encoding really is devalue.
		expect(JSON.parse(clientCall([1, 2]))).not.toEqual([1, 2]);
	});
});
