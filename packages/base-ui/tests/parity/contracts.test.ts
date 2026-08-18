import { describe, expect, it } from 'vitest';
import { NumberField } from '@octanejs/base-ui/number-field';

describe('@octanejs/base-ui public surface', () => {
	it('keeps the unported NumberField interaction surface explicit', () => {
		expect(NumberField).not.toHaveProperty('ScrubArea');
	});
});
