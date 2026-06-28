import type { LexicalEditor } from 'lexical';

import { registerDragonSupport } from '@lexical/dragon';
import { registerRichText } from '@lexical/rich-text';
import { mergeRegister } from 'lexical';
import { useLayoutEffect } from 'octane';

// Ported from @lexical/react/src/shared/useRichTextSetup.ts. Composes one base hook
// (useLayoutEffect), so the caller's slot is forwarded directly.
export function useRichTextSetup(editor: LexicalEditor, slot?: symbol): void {
	useLayoutEffect(
		() => mergeRegister(registerRichText(editor), registerDragonSupport(editor)),
		[editor],
		slot,
	);
}
