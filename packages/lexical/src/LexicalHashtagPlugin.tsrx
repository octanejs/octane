// Ported from @lexical/react/src/LexicalHashtagPlugin.ts.
import { HashtagNode, registerLexicalHashtag } from '@lexical/hashtag';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

export function HashtagPlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		if (!editor.hasNodes([HashtagNode])) {
			throw new Error('HashtagPlugin: HashtagNode not registered on editor');
		}
		return registerLexicalHashtag(editor);
	}, [editor]);

	return null;
}
