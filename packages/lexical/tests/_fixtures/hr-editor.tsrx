import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { HorizontalRulePlugin } from '@octanejs/lexical/LexicalHorizontalRulePlugin';
import { HorizontalRuleNode } from '@octanejs/lexical/LexicalHorizontalRuleNode';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { useEffect } from 'octane';

function Capture(props) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		props.onEditor(editor);
	}, [editor]);
	return null;
}

export function HrEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'octane-hr',
			nodes: [HorizontalRuleNode],
			onError: (error) => {
				throw error;
			},
		}}
	>
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<HorizontalRulePlugin />
		<Capture onEditor={props.onEditor} />
	</LexicalComposer>
}
