import { describe, expect, it } from 'vitest';
import { NumberField } from '@octanejs/base-ui/number-field';

describe('@octanejs/base-ui parity audit contracts', () => {
	// Ordinary-shard framework-contract controls (not react-parity owned).
	// Divergence markers for these gaps live on the ported sources and bind to
	// differential cases that remain parity-executed.
	it('accounts for all 43 public subpaths and 348 upstream test artifacts', async () => {
		await import('../../scripts/check-upstream-crosswalk.mjs');
	});

	it('keeps the unported NumberField interaction surface explicit', () => {
		expect(NumberField).not.toHaveProperty('ScrubArea');
	});
});
