import { BlockNoteEditor } from '@blocknote/core';
import { describe, expect, it, vi } from 'vitest';

import { flushEffects, mount } from '../../../octane/tests/_helpers.js';
import { OptionalHookArguments } from '../_fixtures/optional-hook-arguments.tsrx';

describe('@octanejs/blocknote — compiled hook arguments', () => {
	it('preserves omitted trailing arguments at compiled call sites', () => {
		const options = {};
		const onChange = vi.fn();
		const onSelectionChange = vi.fn();
		const editor = {
			_tiptapEditor: {},
			onChange: vi.fn(() => vi.fn()),
			onSelectionChange: vi.fn(() => vi.fn()),
		} as unknown as BlockNoteEditor<any, any, any>;
		const create = vi.spyOn(BlockNoteEditor, 'create').mockReturnValue(editor);

		const mounted = mount(OptionalHookArguments, {
			options,
			editor,
			onChange,
			onSelectionChange,
		});
		flushEffects();

		expect(create).toHaveBeenNthCalledWith(1, {});
		expect(create).toHaveBeenNthCalledWith(2, options);
		expect(editor.onSelectionChange).toHaveBeenCalledWith(onSelectionChange, undefined);
		expect(editor.onChange).toHaveBeenCalledWith(onChange);

		mounted.unmount();
	});
});
