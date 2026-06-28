import type { LexicalEditor } from 'lexical';

import { $isRootTextContentEmptyCurry } from '@lexical/text';
import { useState, useLayoutEffect } from 'octane';

import { splitSlot, subSlot } from './shared/internal';

// Ported from @lexical/react/src/useLexicalIsTextContentEmpty.ts. `trim` is an
// OPTIONAL user arg, so the trailing compiler-injected slot is found with
// splitSlot (positional resolution would mistake the slot for `trim`). Public
// signature is `(editor: LexicalEditor, trim?: boolean)`.
export function useLexicalIsTextContentEmpty(...args: any[]): boolean {
	const [user, slot] = splitSlot(args);
	const editor = user[0] as LexicalEditor;
	const trim = user[1] as boolean | undefined;

	const [isEmpty, setIsEmpty] = useState(
		editor.read('latest', $isRootTextContentEmptyCurry(editor.isComposing(), trim)),
		subSlot(slot, 'ultce:state'),
	);

	useLayoutEffect(
		() => {
			return editor.registerUpdateListener(({ editorState }) => {
				const isComposing = editor.isComposing();
				const currentIsEmpty = editorState.read($isRootTextContentEmptyCurry(isComposing, trim));
				setIsEmpty(currentIsEmpty);
			});
		},
		[editor, trim],
		subSlot(slot, 'ultce:le'),
	);

	return isEmpty;
}
