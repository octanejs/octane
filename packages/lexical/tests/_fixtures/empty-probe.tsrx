import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { useLexicalIsTextContentEmpty } from '@octanejs/lexical/useLexicalIsTextContentEmpty';
import { useEffect } from 'octane';

function Probe(props) {
	const [editor] = useLexicalComposerContext();
	const isEmpty = useLexicalIsTextContentEmpty(editor);
	// Report whenever the tracked emptiness changes (the hook re-renders on change).
	useEffect(() => {
		props.onState(editor, isEmpty);
	}, [isEmpty]);
	return null;
}

export function EmptyProbeEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'octane-empty',
			onError: (error) => {
				throw error;
			},
		}}
	>
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<Probe onState={props.onState} />
	</LexicalComposer>
}
