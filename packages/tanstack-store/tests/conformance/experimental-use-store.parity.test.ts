/**
 * Ordinary Octane-only divergence evidence for the intentional omission of
 * upstream's experimental `_useStore` export. Kept outside react-parity
 * ownership; the structured divergence cites the required omission-types lane.
 */
import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/tanstack-store';

describe('export surface', function () {
	it('matches the supported @tanstack/react-store runtime exports', async function () {
		const real = await import('@tanstack/react-store');
		const expected = Object.keys(real)
			.filter(function (name) {
				return name !== '_useStore';
			})
			.sort();
		expect(Object.keys(binding).sort()).toEqual(expected);
	});
});
