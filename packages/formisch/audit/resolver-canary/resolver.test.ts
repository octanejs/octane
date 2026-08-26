import { framework } from '../../upstream/packages/core/src/index.ts';
import { expect, test } from 'vitest';

test('adapted core and methods tests resolve to the Octane source tree', () => {
	expect(framework).toBe('octane');
});
