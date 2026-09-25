import { BlockNoteEditor } from '@blocknote/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mount } from '../../../octane/tests/_helpers.js';
import { HookArguments, HookDependencies } from '../_fixtures/hook-arguments.tsrx';

describe('@octanejs/blocknote compiled hook arguments', () => {
	afterEach(() => vi.restoreAllMocks());
	it('preserves omitted dependencies at compiled call sites', () => {
		const options = {};
		const defaultEditor = { id: 'default' } as unknown as BlockNoteEditor<any, any, any>;
		const configuredEditor = { id: 'configured' } as unknown as BlockNoteEditor<any, any, any>;
		const create = vi
			.spyOn(BlockNoteEditor, 'create')
			.mockReturnValueOnce(defaultEditor)
			.mockReturnValueOnce(configuredEditor);
		const capture = vi.fn();

		const mounted = mount(HookArguments, { options, capture });

		expect(create).toHaveBeenNthCalledWith(1, {});
		expect(create).toHaveBeenNthCalledWith(2, options);
		expect(capture).toHaveBeenCalledWith(defaultEditor, configuredEditor);
		mounted.update(HookArguments, { options: { editable: false }, capture });
		expect(capture).toHaveBeenLastCalledWith(defaultEditor, configuredEditor);
		expect(create).toHaveBeenCalledTimes(2);

		mounted.unmount();
	});

	it('recreates only the editor whose dependencies change', () => {
		const first = {} as BlockNoteEditor;
		const second = {} as BlockNoteEditor;
		const replacement = {} as BlockNoteEditor;
		const create = vi
			.spyOn(BlockNoteEditor, 'create')
			.mockReturnValueOnce(first)
			.mockReturnValueOnce(second)
			.mockReturnValueOnce(replacement);
		const capture = vi.fn();
		const options = { editable: false };
		const mounted = mount(HookDependencies, { options, dependencies: [1], capture });
		expect(capture).toHaveBeenLastCalledWith(first, second);

		mounted.update(HookDependencies, { options, dependencies: [1], capture });
		expect(capture).toHaveBeenLastCalledWith(first, second);
		expect(create).toHaveBeenCalledTimes(2);

		mounted.update(HookDependencies, { options, dependencies: [2], capture });
		expect(capture).toHaveBeenLastCalledWith(first, replacement);
		expect(create).toHaveBeenCalledTimes(3);
		expect(create).toHaveBeenLastCalledWith(options);
		mounted.unmount();
	});
});
