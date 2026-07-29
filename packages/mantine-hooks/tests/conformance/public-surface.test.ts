import { describe, expect, it } from 'vitest';
import * as upstream from '@mantine/hooks';
import * as ported from '../../src/index';

describe('@octanejs/mantine-hooks public surface', () => {
	it('exports every @mantine/hooks 9.5.0 runtime symbol', () => {
		expect(Object.keys(ported).sort()).toEqual(Object.keys(upstream).sort());
	});
});
