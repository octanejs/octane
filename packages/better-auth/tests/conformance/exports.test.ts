import { describe, expect, it } from 'vitest';
import { createAuthClient, useStore } from '@octanejs/better-auth';

describe('exports', () => {
	it('exposes the Octane client and store hooks', () => {
		expect(typeof createAuthClient).toBe('function');
		expect(typeof useStore).toBe('function');
	});
});
