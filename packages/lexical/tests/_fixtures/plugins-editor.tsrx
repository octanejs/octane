import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { HistoryPlugin } from '@octanejs/lexical/LexicalHistoryPlugin';
import { OnChangePlugin } from '@octanejs/lexical/LexicalOnChangePlugin';
import { ClearEditorPlugin } from '@octanejs/lexical/LexicalClearEditorPlugin';
import { AutoFocusPlugin } from '@octanejs/lexical/LexicalAutoFocusPlugin';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { useEffect } from 'octane';

function Capture(props) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		props.onEditor(editor);
	}, [editor]);
	return null;
}

export function PluginsEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'octane-plugins',
			onError: (error) => {
				throw error;
			},
		}}
	>
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<HistoryPlugin />
		<OnChangePlugin onChange={props.onChange} />
		<ClearEditorPlugin />
		<AutoFocusPlugin />
		<Capture onEditor={props.onEditor} />
	</LexicalComposer>
}
