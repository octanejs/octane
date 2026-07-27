import { describe, expect, it } from 'vitest';
import { parseJsonc } from '../src/kernel/jsonc.js';

describe('parseJsonc', () => {
	it('reads the dialect tsconfig is actually written in', () => {
		const parsed = parseJsonc(`{
			// line comment
			"compilerOptions": {
				/* block comment */
				"strict": true,
				"types": ["node"],
			},
		}`);
		expect(parsed).toEqual({ compilerOptions: { strict: true, types: ['node'] } });
	});

	it('leaves comment and comma characters inside strings alone', () => {
		expect(parseJsonc('{"a": "// not a comment", "b": "trailing, ]"}')).toEqual({
			a: '// not a comment',
			b: 'trailing, ]',
		});
	});

	it('handles escaped quotes inside strings', () => {
		expect(parseJsonc('{"a": "say \\"hi\\"", "b": 1}')).toEqual({ a: 'say "hi"', b: 1 });
	});

	it('throws on genuinely invalid JSON', () => {
		expect(() => parseJsonc('{ nope }')).toThrow();
	});
});
