import { expectTypeOf, test } from 'vitest';
import * as binding from '../src';

test('omits the upstream experimental _useStore hook', () => {
	expectTypeOf(binding).not.toHaveProperty('_useStore');
});
