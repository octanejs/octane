import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, useEditorState } from '@octanejs/tiptap';
import { useEffect } from 'octane';

const extensions = [StarterKit];

export function BasicEditor(props) @{
	const editor = useEditor({
		extensions,
		content: '<p>Hello TipTap</p>',
		immediatelyRender: true,
	});
	const text = useEditorState({
		editor,
		selector: ({ editor: currentEditor }) => currentEditor?.getText() ?? 'deferred',
	});

	useEffect(() => {
		if (editor) {
			props.onEditor?.(editor);
		}
	}, [editor, props.onEditor]);

	<section data-tiptap-fixture="basic">
		<output id="editor-state">{text ?? 'deferred'}</output>
		<button
			id="replace-content"
			type="button"
			onClick={() => editor?.commands.setContent('<p>Shared update</p>')}
		>
			replace content
		</button>
		@if (editor) {
			<EditorContent editor={editor} data-editor-host="true" />
		}
	</section>
}
