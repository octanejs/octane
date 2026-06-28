// Ported from @lexical/react/src/LexicalEditorRefPlugin.tsx. Hands the editor to
// a callback ref or object ref so UI outside the composer can reach it.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

export function EditorRefPlugin(props) {
	const [editor] = useLexicalComposerContext();
	const editorRef = props.editorRef;

	useEffect(() => {
		if (typeof editorRef === 'function') {
			editorRef(editor);
		} else if (typeof editorRef === 'object' && editorRef !== null) {
			editorRef.current = editor;
		}
	}, [editor]);

	return null;
}
