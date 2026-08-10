import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { flushSync } from 'octane';
import { describe, expect, it } from 'vitest';

import { AutoKeyMenuPair } from '../_fixtures/menus.tsrx';
import { flushEffects, mount } from '../_helpers';

const extensions = [StarterKit];
function neverShow(): boolean {
	return false;
}

function settle(): void {
	flushEffects();
	flushSync(function () {});
	flushEffects();
	flushSync(function () {});
	flushEffects();
}

describe('@octanejs/tiptap menus', function () {
	it('gives sibling menus independent automatic plugin keys', function () {
		const editor = new Editor({ extensions, content: '<p></p>' });
		let first: HTMLDivElement | null = null;
		let second: HTMLDivElement | null = null;
		const originalPluginCount = editor.state.plugins.length;
		const result = mount(AutoKeyMenuPair as any, {
			editor,
			shouldShow: neverShow,
			firstRef: function (element: HTMLDivElement | null) {
				first = element;
			},
			secondRef: function (element: HTMLDivElement | null) {
				second = element;
			},
		});
		settle();

		expect(first).toBeInstanceOf(HTMLDivElement);
		expect(second).toBeInstanceOf(HTMLDivElement);
		expect(first).not.toBe(second);
		expect(editor.state.plugins).toHaveLength(originalPluginCount + 2);

		result.unmount();
		settle();
		expect(editor.state.plugins).toHaveLength(originalPluginCount);
		editor.destroy();
	});
});
