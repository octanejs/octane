import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { useEffect } from 'octane';

// Exposes the editor instance to the test (and, for the differential, lets both
// the octane and the real-@lexical/react mounts hand back their editor).
function Capture(props) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		props.onEditor(editor);
	}, [editor]);
	return null;
}

export function BasicEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'octane-test',
			onError: (error) => {
				throw error;
			},
		}}
	>
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<Capture onEditor={props.onEditor} />
	</LexicalComposer>
}
