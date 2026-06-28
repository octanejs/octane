import type { EntityMatch } from '@lexical/text';
import type { Klass, TextNode } from 'lexical';

import { useLexicalComposerContext } from './LexicalComposerContext';
import { registerLexicalTextEntity } from '@lexical/text';
import { mergeRegister } from 'lexical';
import { useEffect } from 'octane';

// Ported from @lexical/react/src/useLexicalTextEntity.ts. Three required user args,
// so the trailing slot is positional (4th).
export function useLexicalTextEntity<T extends TextNode>(
	getMatch: (text: string) => null | EntityMatch,
	targetNode: Klass<T>,
	createNode: (textNode: TextNode) => T,
	slot?: symbol,
): void {
	const [editor] = useLexicalComposerContext();

	useEffect(
		() => mergeRegister(...registerLexicalTextEntity(editor, getMatch, targetNode, createNode)),
		[createNode, editor, getMatch, targetNode],
		slot,
	);
}
