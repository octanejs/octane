import { describe, expect, it } from 'vitest';
import * as octaneStreamdown from '@octanejs/streamdown';
import * as upstreamStreamdown from 'streamdown';

describe('@octanejs/streamdown public surface', () => {
	it('matches every Streamdown 2.5.0 runtime export', () => {
		expect(Object.keys(octaneStreamdown).sort()).toEqual(Object.keys(upstreamStreamdown).sort());
	});
});
