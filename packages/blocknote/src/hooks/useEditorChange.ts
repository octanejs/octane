// Independently authored Octane adapter for the public @blocknote/react 0.53.0 API.
import type { BlockNoteEditor } from '@blocknote/core';
import { useEffect } from 'octane';

import { useBlockNoteContext } from '../BlockNoteContext';
import { splitSlot, subSlot } from '../internal';

type ChangeCallback = Parameters<BlockNoteEditor<any, any, any>['onChange']>[0];

/** Subscribe to content changes of `editor`, or of the context editor when omitted. */
export function useEditorChange(
	callback: ChangeCallback,
	editor?: BlockNoteEditor<any, any, any>,
): void;
export function useEditorChange(...args: unknown[]): void {
	const [userArgs, slot] = splitSlot(args);
	const callback = userArgs[0] as ChangeCallback;
	const context = useBlockNoteContext();
	const editor = (userArgs[1] as BlockNoteEditor<any, any, any> | undefined) ?? context?.editor;

	if (!editor) {
		throw new Error(
			'useEditorChange was called outside of a BlockNoteContext provider or BlockNoteViewRaw component',
		);
	}

	useEffect(() => editor.onChange(callback), [editor, callback], subSlot(slot, 'subscribe'));
}
