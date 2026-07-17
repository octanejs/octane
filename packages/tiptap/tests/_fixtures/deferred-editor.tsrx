import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, useEditorState } from '@octanejs/tiptap';
import { useEffect } from 'octane';

const extensions = [StarterKit];

export function DeferredEditor(props) @{
	const editor = useEditor({
		extensions,
		content: '<p>Hydrated editor</p>',
		immediatelyRender: false,
	});
	const selectedText = useEditorState({
		editor,
		selector: ({ editor: currentEditor }) => currentEditor?.getText() ?? 'deferred',
	});

	useEffect(() => {
		if (editor) {
			props?.onEditor?.(editor);
		}
	}, [editor, props?.onEditor]);

	<main id="deferred-editor">
		<output id="deferred-status">
			{editor ? 'ready' : 'deferred'}
		</output>
		<output id="deferred-selection">
			{selectedText ?? 'deferred'}
		</output>
		@if (editor) {
			<EditorContent editor={editor} data-editor-host="deferred" />
		}
	</main>
}
