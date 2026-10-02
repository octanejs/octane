import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { EditorRefPlugin } from '@octanejs/lexical/LexicalEditorRefPlugin';
import { CharacterLimitPlugin } from '@octanejs/lexical/LexicalCharacterLimitPlugin';
import { OverflowNode } from '@lexical/overflow';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';

// For porting @lexical/react's LexicalCharacterLimitPlugin.test.tsx: an editor
// that already holds `props.text` when CharacterLimitPlugin mounts on top of it.
export function CharacterLimitEditor(props) @{
	<LexicalComposer
		initialConfig={{
			editorState: () => {
				$getRoot()
					.clear()
					.append($createParagraphNode().append($createTextNode(props.text)));
			},
			namespace: 'character-limit',
			nodes: [OverflowNode],
			onError: (error) => {
				throw error;
			},
		}}
	>
		<EditorRefPlugin editorRef={props.editorRef} />
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<CharacterLimitPlugin charset={props.charset} maxLength={props.maxLength} />
	</LexicalComposer>
}
