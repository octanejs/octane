// OCTANE DIVERGENCE: wrapJsx cannot patch a jsx-runtime Octane does not have.
import { describe, expect, it } from 'vitest';
import { wrapJsx } from '../src/runtime/index.ts';

describe('wrapJsx', function wrapJsxSuite() {
	it('returns the input unchanged', function identity() {
		function jsx() {
			return null;
		}
		expect(wrapJsx(jsx)).toBe(jsx);
		expect(wrapJsx(null)).toBe(null);
	});
});
