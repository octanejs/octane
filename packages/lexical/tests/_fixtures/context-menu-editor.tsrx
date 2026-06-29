import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { NodeContextMenuPlugin } from '@octanejs/lexical/LexicalNodeContextMenuPlugin';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { useEffect } from 'octane';

function Capture(props) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		props.onEditor(editor);
	}, [editor]);
	return null;
}

export function ContextMenuEditor(props) @{
	<LexicalComposer
		initialConfig={{
			namespace: 'octane-ctxmenu',
			onError: (e) => {
				throw e;
			},
		}}
	>
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<NodeContextMenuPlugin
			items={props.items}
			className="ctx-menu"
			itemClassName="ctx-item"
			separatorClassName="ctx-sep"
		/>
		<Capture onEditor={props.onEditor} />
	</LexicalComposer>
}
