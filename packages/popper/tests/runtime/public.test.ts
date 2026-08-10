import { describe, expect, it } from 'vitest';
import * as Popper from '@octanejs/popper';

describe('@octanejs/popper public contract', function publicContractSuite() {
	it('exports the exact upstream runtime surface', function exportsExactSurface() {
		expect(Object.keys(Popper).sort()).toEqual(['Manager', 'Popper', 'Reference', 'usePopper']);
	});
});
