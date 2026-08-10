import { describe, expect, it } from 'vitest';

import * as root from '@octanejs/swr';
import infinite from '@octanejs/swr/infinite';
import immutable from '@octanejs/swr/immutable';
import mutation from '@octanejs/swr/mutation';
import subscription from '@octanejs/swr/subscription';
import * as internal from '@octanejs/swr/_internal';

describe('SWR migration adoption', () => {
	it('maps every public import root without an SWR-specific API redesign', () => {
		expect(typeof root.default).toBe('function');
		expect(typeof root.mutate).toBe('function');
		expect(typeof root.SWRConfig).toBe('function');
		expect(typeof infinite).toBe('function');
		expect(typeof immutable).toBe('function');
		expect(typeof mutation).toBe('function');
		expect(typeof subscription).toBe('function');
		expect(typeof internal.serialize).toBe('function');
	});
});
