// Independently authored Octane adapter for the public @blocknote/react 0.53.0 API.
import type { BlockNoteEditor } from '@blocknote/core';
import { useEffect } from 'octane';

import { useBlockNoteContext } from '../BlockNoteContext';
import { splitSlot, subSlot } from '../internal';

/** Subscribe to selection changes of `editor`, or of the context editor when omitted. */
export function useEditorSelectionChange(
	callback: () => void,
	editor?: BlockNoteEditor<any, any, any>,
	includeSelectionChangedByRemote?: boolean,
): void;
export function useEditorSelectionChange(...args: unknown[]): void {
	const [userArgs, slot] = splitSlot(args);
	const callback = userArgs[0] as () => void;
	const includeSelectionChangedByRemote = userArgs[2] as boolean | undefined;
	const context = useBlockNoteContext();
	const editor = (userArgs[1] as BlockNoteEditor<any, any, any> | undefined) ?? context?.editor;

	if (!editor) {
		throw new Error(
			'useEditorSelectionChange was called outside of a BlockNoteContext provider or BlockNoteViewRaw component',
		);
	}

	useEffect(
		() => editor.onSelectionChange(callback, includeSelectionChangedByRemote),
		[editor, callback, includeSelectionChangedByRemote],
		subSlot(slot, 'subscribe'),
	);
}
