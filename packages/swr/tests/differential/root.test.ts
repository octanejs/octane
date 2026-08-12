import { describe, expect, it } from 'vitest';
import * as rootBinding from '../../src/index/index';
import * as reactRootBinding from '../../upstream/src/index/index';

describe('SWR U3 pinned React/Octane root surface', () => {
	// @parity-case differential:root-surface
	it('preserves the exact pinned root runtime surface', () => {
		expect(Object.keys(rootBinding).sort()).toEqual(Object.keys(reactRootBinding).sort());
	});
});
