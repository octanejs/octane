// Ported from @lexical/react/src/LexicalClearEditorPlugin.ts. registerClearEditor
// comes from @lexical/extension's framework-agnostic core.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { registerClearEditor } from '@lexical/extension';
import { useLayoutEffect } from 'octane';

export function ClearEditorPlugin(props) {
	const [editor] = useLexicalComposerContext();
	const onClear = props.onClear;
	useLayoutEffect(() => registerClearEditor(editor, onClear), [editor, onClear]);
	return null;
}
