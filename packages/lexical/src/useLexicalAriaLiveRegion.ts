import { AriaLiveRegionExtension } from '@lexical/a11y';
import { getExtensionDependencyFromEditor } from '@lexical/extension';
import { useCallback } from 'octane';

import { useLexicalComposerContext } from './LexicalComposerContext';

// Ported from @lexical/react/src/useLexicalAriaLiveRegion.ts. Composes exactly one
// slot-keyed base hook (useCallback), so the caller's slot is forwarded directly.

/**
 * Returns a stable `announce` function backed by the editor's
 * {@link AriaLiveRegionExtension} output. Requires `AriaLiveRegionExtension` in
 * the editor's extension tree.
 */
export function useLexicalAriaLiveRegion(slot?: symbol): (message: string) => void {
	const [editor] = useLexicalComposerContext();
	return useCallback(
		(message: string) => {
			const dep = getExtensionDependencyFromEditor(editor, AriaLiveRegionExtension);
			dep.output.announce(message);
		},
		[editor],
		slot,
	);
}
