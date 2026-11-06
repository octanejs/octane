import { describe, expect, it } from 'vitest';
import { useSelector, useStore } from '@octanejs/tanstack-form';

describe('package exports', () => {
	it('exports the useSelector and useStore store hooks', () => {
		expect(useSelector).toBeTypeOf('function');
		expect(useStore).toBeTypeOf('function');
	});
});
