import StarterKit from '@tiptap/starter-kit';
import {
	EditorProvider,
	Tiptap,
	useCurrentEditor,
	useTiptap,
	useTiptapState,
} from '@octanejs/tiptap';
import { useEffect } from 'octane';

const extensions = [StarterKit];

function ContextProbe(props) @{
	const modern = useTiptap();
	const legacy = useCurrentEditor();
	const text = useTiptapState(({ editor }) => editor.getText());

	useEffect(() => {
		props.onContexts(modern.editor, legacy.editor);
	}, [modern.editor, legacy.editor, props.onContexts]);

	<output data-context-text="true">{text}</output>
}

export function ContextEditor(props) @{
	<Tiptap editor={props.editor}>
		<ContextProbe onContexts={props.onContexts} />
		<Tiptap.Content data-editor-host="context" />
	</Tiptap>
}

function LegacyProbe(props) @{
	const { editor } = useCurrentEditor();

	useEffect(() => {
		if (editor) {
			props.onEditor(editor);
		}
	}, [editor, props.onEditor]);

	<span data-provider-piece="child">
		{editor?.getText() ?? 'deferred'}
	</span>
}

export function LegacyProvider(props) @{
	<EditorProvider
		extensions={extensions}
		content="<p>Provided content</p>"
		immediatelyRender={true}
		editorContainerProps={{ 'data-provider-piece': 'content' }}
		slotBefore={<span data-provider-piece="before">before</span>}
		slotAfter={<span data-provider-piece="after">after</span>}
	>
		<LegacyProbe onEditor={props.onEditor} />
	</EditorProvider>
}
