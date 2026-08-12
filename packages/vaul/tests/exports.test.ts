import { describe, expect, it } from 'vitest';
import * as binding from '../src/index.tsrx';
import * as reactBinding from 'vaul';

describe('@octanejs/vaul exports', () => {
	it('matches the pinned upstream root runtime entry', () => {
		expect(Object.keys(binding).sort()).toEqual(Object.keys(reactBinding).sort());
		expect(Object.keys(binding.Drawer).sort()).toEqual(Object.keys(reactBinding.Drawer).sort());
	});
});
