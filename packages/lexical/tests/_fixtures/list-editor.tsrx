import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { ListPlugin } from '@octanejs/lexical/LexicalListPlugin';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { ListItemNode, ListNode } from '@lexical/list';
import { useEffect } from 'octane';

function Capture(props) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		props.onEditor(editor);
	}, [editor]);
	return null;
}

export function ListEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'octane-list',
			nodes: [ListNode, ListItemNode],
			onError: (error) => {
				throw error;
			},
		}}
	>
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<ListPlugin />
		<Capture onEditor={props.onEditor} />
	</LexicalComposer>
}
