import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { PlainTextPlugin } from '@octanejs/lexical/LexicalPlainTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { useEffect } from 'octane';

// Configurable editor for porting @lexical/react's PlainRichTextPlugin.test.tsx:
// the test drives plugin (plain/rich), nodes, initialEditorState, and whether a
// placeholder render-prop is shown — all via props.
function Grab(props) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		props.onEditor(editor);
	}, [editor]);
	return null;
}

function renderPlaceholder(isEditable) {
	return isEditable ? <span class="placeholder">My placeholder</span> : null;
}

export function ConfigEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: '',
			theme: {},
			nodes: props.nodes,
			editorState: props.editorState,
			onError: (error) => {
				throw error;
			},
		}}
	>
		<Grab onEditor={props.onEditor} />
		@if (props.plugin === 'plain') {
			<PlainTextPlugin
				contentEditable={<ContentEditable />}
				placeholder={props.withPlaceholder ? renderPlaceholder : null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
		} @else {
			<RichTextPlugin
				contentEditable={<ContentEditable />}
				placeholder={props.withPlaceholder ? renderPlaceholder : null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
		}
	</LexicalComposer>
}
