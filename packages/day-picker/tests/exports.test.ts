import { describe, expect, it } from 'vitest';
import * as binding from '../src/index.ts';
import * as reactBinding from 'react-day-picker';
import * as locales from '../src/locale.ts';
import * as reactLocales from 'react-day-picker/locale';

describe('@octanejs/day-picker exports', () => {
	it('matches the pinned upstream root runtime entry', () => {
		expect(Object.keys(binding).sort()).toEqual(Object.keys(reactBinding).sort());
	});

	it('matches the pinned upstream locale runtime entry', () => {
		expect(Object.keys(locales).sort()).toEqual(Object.keys(reactLocales).sort());
	});
});
