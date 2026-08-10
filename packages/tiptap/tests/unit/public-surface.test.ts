import * as reactTiptap from '@tiptap/react';
import * as reactMenus from '@tiptap/react/menus';
import * as octaneTiptap from '@octanejs/tiptap';
import * as octaneMenus from '@octanejs/tiptap/menus';
import { describe, expect, it } from 'vitest';

function publicNames(module: Record<string, unknown>): string[] {
	return Object.keys(module).sort();
}

describe('@octanejs/tiptap public module surface', function () {
	it('matches the @tiptap/react 3.28 root runtime exports', function () {
		expect(publicNames(octaneTiptap)).toEqual(publicNames(reactTiptap));
	});

	it('matches the @tiptap/react 3.28 menus runtime exports', function () {
		expect(publicNames(octaneMenus)).toEqual(publicNames(reactMenus));
	});
});
