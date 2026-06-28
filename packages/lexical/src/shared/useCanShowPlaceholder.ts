import type { LexicalEditor } from 'lexical';

import { $canShowPlaceholderCurry } from '@lexical/text';
import { mergeRegister } from 'lexical';
import { useState, useLayoutEffect } from 'octane';

import { subSlot } from './internal';

// Ported from @lexical/react/src/shared/useCanShowPlaceholder.ts. Plain `.ts` hook:
// the caller injects `slot`; each base hook gets its own sub-slot.

function canShowPlaceholderFromCurrentEditorState(editor: LexicalEditor): boolean {
	return editor.read('latest', $canShowPlaceholderCurry(editor.isComposing()));
}

export function useCanShowPlaceholder(editor: LexicalEditor, slot?: symbol): boolean {
	const [canShowPlaceholder, setCanShowPlaceholder] = useState(
		() => canShowPlaceholderFromCurrentEditorState(editor),
		subSlot(slot, 'ucsp:state'),
	);

	useLayoutEffect(
		() => {
			function resetCanShowPlaceholder() {
				setCanShowPlaceholder(canShowPlaceholderFromCurrentEditorState(editor));
			}
			resetCanShowPlaceholder();
			return mergeRegister(
				editor.registerUpdateListener(() => resetCanShowPlaceholder()),
				editor.registerEditableListener(() => resetCanShowPlaceholder()),
			);
		},
		[editor],
		subSlot(slot, 'ucsp:le'),
	);

	return canShowPlaceholder;
}
