import type { LexicalEditor, NodeKey } from 'lexical';

import { useLexicalComposerContext } from './LexicalComposerContext';
import {
	$createNodeSelection,
	$getNodeByKey,
	$getSelection,
	$isNodeSelection,
	$setSelection,
} from 'lexical';
import { useCallback, useEffect, useState } from 'octane';

import { subSlot } from './shared/internal';

// Ported from @lexical/react/src/useLexicalNodeSelection.ts. Plain `.ts` hook;
// composes four base hooks, each given a distinct sub-slot.

function isNodeSelected(editor: LexicalEditor, key: NodeKey): boolean {
	return editor.read('latest', () => {
		const node = $getNodeByKey(key);
		if (node === null) {
			return false;
		}
		return node.isSelected();
	});
}

export function useLexicalNodeSelection(
	key: NodeKey,
	slot?: symbol,
): [boolean, (selected: boolean) => void, () => void] {
	const [editor] = useLexicalComposerContext();

	const [isSelected, setIsSelected] = useState(
		() => isNodeSelected(editor, key),
		subSlot(slot, 'ulns:state'),
	);

	useEffect(
		() => {
			let isMounted = true;
			const unregister = editor.registerUpdateListener(() => {
				if (isMounted) {
					setIsSelected(isNodeSelected(editor, key));
				}
			});
			return () => {
				isMounted = false;
				unregister();
			};
		},
		[editor, key],
		subSlot(slot, 'ulns:le'),
	);

	const setSelected = useCallback(
		(selected: boolean) => {
			editor.update(() => {
				let selection = $getSelection();
				if (!$isNodeSelection(selection)) {
					selection = $createNodeSelection();
					$setSelection(selection);
				}
				if ($isNodeSelection(selection)) {
					if (selected) {
						selection.add(key);
					} else {
						selection.delete(key);
					}
				}
			});
		},
		[editor, key],
		subSlot(slot, 'ulns:set'),
	);

	const clearSelected = useCallback(
		() => {
			editor.update(() => {
				const selection = $getSelection();
				if ($isNodeSelection(selection)) {
					selection.clear();
				}
			});
		},
		[editor],
		subSlot(slot, 'ulns:clear'),
	);

	return [isSelected, setSelected, clearSelected];
}
