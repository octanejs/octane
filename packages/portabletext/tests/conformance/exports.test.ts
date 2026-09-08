import { describe, expect, it } from 'vitest';
import * as portabletext from '@octanejs/portabletext';
import * as upstream from '@portabletext/react';

describe('@octanejs/portabletext — runtime surface', () => {
	it('matches the upstream runtime export names', () => {
		expect(Object.keys(portabletext).sort()).toEqual(Object.keys(upstream).sort());
	});
});
