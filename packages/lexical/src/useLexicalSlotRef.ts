import type { LexicalEditor, NodeKey } from 'lexical';

import { mountSlotContainer, unmountSlotContainer } from 'lexical';
import { useCallback } from 'octane';

// Ported from @lexical/react/src/useLexicalSlotRef.ts. Three required user args, so
// the trailing slot is positional.
export function useLexicalSlotRef<T extends HTMLElement = HTMLElement>(
	editor: LexicalEditor,
	nodeKey: NodeKey,
	slotName: string,
	slot?: symbol,
): (target: T | null) => (() => void) | void {
	return useCallback(
		(target: T | null) => {
			if (target) {
				const container = mountSlotContainer(editor, nodeKey, slotName, target);
				if (container) {
					return unmountSlotContainer.bind(null, editor, nodeKey, container);
				}
			}
		},
		[editor, nodeKey, slotName],
		slot,
	);
}
