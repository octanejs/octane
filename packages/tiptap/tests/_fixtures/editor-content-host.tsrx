import { EditorContent } from '@octanejs/tiptap';

export function EditorContentHost(props) @{
	<EditorContent editor={props.editor} data-editor-host="standalone" ref={props.hostRef} />
}
