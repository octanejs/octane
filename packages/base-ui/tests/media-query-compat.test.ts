import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { useMediaQuery } from '@octanejs/base-ui';
import { BarrelMediaQuery } from './_fixtures/media-query-compat.tsrx';

describe('@octanejs/base-ui media-query compatibility', () => {
	it('exports useMediaQuery from the root barrel', () => {
		expect(typeof useMediaQuery).toBe('function');
	});

	it('accepts a single query argument from the previous barrel surface', () => {
		const result = mount(BarrelMediaQuery);
		expect(result.container.querySelector('.mq')?.textContent).toBe('false');
		result.unmount();
	});
});
