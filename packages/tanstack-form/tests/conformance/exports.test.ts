import { describe, expect, it } from 'vitest';
import { useSelector, useStore } from '@octanejs/tanstack-form';

describe('package exports', () => {
	it('exports useSelector and useStore from @octanejs/tanstack-store', () => {
		expect(useSelector).toBeTypeOf('function');
		expect(useStore).toBeTypeOf('function');
	});
});
