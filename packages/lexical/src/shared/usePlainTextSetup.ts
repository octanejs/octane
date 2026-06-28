import type { LexicalEditor } from 'lexical';

import { registerDragonSupport } from '@lexical/dragon';
import { registerPlainText } from '@lexical/plain-text';
import { mergeRegister } from 'lexical';
import { useLayoutEffect } from 'octane';

// Ported from @lexical/react/src/shared/usePlainTextSetup.ts.
export function usePlainTextSetup(editor: LexicalEditor, slot?: symbol): void {
	useLayoutEffect(
		() => mergeRegister(registerPlainText(editor), registerDragonSupport(editor)),
		[editor],
		slot,
	);
}
