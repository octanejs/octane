import { describe, expect, it } from 'vitest';
import { dataSchema as s } from '../src/data/index.js';

describe('portable data schemas', () => {
	it('derives identity from the wire contract, including constraints', () => {
		const item = s.object({ title: s.string({ minLength: 1 }), state: s.enum(['read', 'saved']) });
		const reordered = s.object({
			state: s.enum(['saved', 'read']),
			title: s.string({ minLength: 1 }),
		});
		expect(item.identity).toBe(reordered.identity);
		expect(s.array(item).identity).toBe(s.array(reordered).identity);
		expect(s.nullable(item).identity).not.toBe(item.identity);
		expect(s.string().identity).not.toBe(s.string({ minLength: 1 }).identity);
		expect(s.enum(['saved']).identity).not.toBe(s.enum(['read', 'saved']).identity);
		expect(s.integer({ minimum: 0 }).identity).not.toBe(s.integer().identity);
	});

	it('validates nested untrusted values before returning a result', () => {
		const rows = s.array(
			s.object({ id: s.integer({ minimum: 1 }), title: s.nullable(s.string()) }),
		);
		expect(rows.parse([{ id: 1, title: null }])).toEqual([{ id: 1, title: null }]);
		for (const row of [{ id: 0, title: 'Book' }, { id: 2 }, { id: 2, title: null, extra: true }]) {
			expect(() => rows.parse([{ id: 1, title: null }, row])).toThrow();
		}
		const accessor = Object.defineProperty({ id: 1 }, 'title', {
			enumerable: true,
			get() {
				throw new Error('accessor ran');
			},
		});
		expect(() => rows.parse([accessor])).toThrow('does not match');
		expect(() => rows.parse(new Array(1))).toThrow();
		expect(() => s.enum(['read', 'saved']).parse('deleted')).toThrow();
		expect(() => s.integer().parse(Number.MAX_SAFE_INTEGER + 1)).toThrow();
	});
});
