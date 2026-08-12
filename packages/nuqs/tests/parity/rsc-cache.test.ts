import { describe, expect, it } from 'vitest';
import * as server from '@octanejs/nuqs/server';

describe('server entry', () => {
	// OCTANE DIVERGENCE[rsc-cache-unavailable][conformance:nuqs-rsc-cache]
	// @parity-case conformance:nuqs-rsc-cache
	it('does NOT ship createSearchParamsCache (RSC-only, see status.json)', () => {
		expect((server as Record<string, unknown>).createSearchParamsCache).toBeUndefined();
	});
});
