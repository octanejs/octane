import { expect, test } from 'vitest';
import * as zeroReact from '@rocicorp/zero/react';
import * as zeroOctane from '@octanejs/zero';

test('matches the @rocicorp/zero/react 1.8.0 runtime export surface', () => {
	expect(Object.keys(zeroOctane).sort()).toEqual(Object.keys(zeroReact).sort());
});
