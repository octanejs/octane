import { describe, expect, it } from 'vitest';
import { STATE_WRITE_CONTEXT } from '../src/state-model-runtime.js';

describe('state model runtime copies', () => {
	it('shares authored-execution provenance across separately evaluated copies', async () => {
		const isolatedCopy = await import('../src/state-model-runtime.js?isolated-copy');

		expect(isolatedCopy.STATE_WRITE_CONTEXT).toBe(STATE_WRITE_CONTEXT);
	});
});
