import type { LexicalEditor } from 'lexical';

import { useLexicalSubscription, type LexicalSubscription } from './useLexicalSubscription';

// Ported from @lexical/react/src/useLexicalEditable.ts. Composes exactly one base
// hook (useLexicalSubscription), so it forwards the caller's slot straight through.

function subscription(editor: LexicalEditor): LexicalSubscription<boolean> {
	return {
		initialValueFn: () => editor.isEditable(),
		subscribe: (callback) => editor.registerEditableListener(callback),
	};
}

/**
 * Get the current value for {@link LexicalEditor.isEditable} via
 * {@link useLexicalSubscription}. Prefer this over observing
 * {@link LexicalEditor.registerEditableListener} manually.
 */
export function useLexicalEditable(slot?: symbol): boolean {
	return useLexicalSubscription(subscription, slot);
}
