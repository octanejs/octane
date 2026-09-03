import { expect, it } from 'vitest';
import * as dom from '@testing-library/dom';
import * as testingLibrary from '../src/index';
import * as pure from '../src/pure';

it('preserves the complete DOM query surface in both public entrypoints', () => {
	for (const name of Object.keys(dom) as (keyof typeof dom)[]) {
		if (name === 'fireEvent' || name === ('default' as keyof typeof dom)) continue;
		expect(testingLibrary[name], name).toBe(dom[name]);
		expect(pure[name], name).toBe(dom[name]);
	}
});
