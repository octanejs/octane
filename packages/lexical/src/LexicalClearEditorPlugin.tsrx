// Ported from @lexical/react/src/LexicalClearEditorPlugin.ts. registerClearEditor
// comes from @lexical/extension's framework-agnostic core.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { registerClearEditor } from '@lexical/extension';
import { useLayoutEffect } from 'octane';

type Props = Readonly<{
		onClear?: () => void;
	}>;

export function ClearEditorPlugin(props: Props) {
	const [editor] = useLexicalComposerContext();
	const onClear = props.onClear;
	useLayoutEffect(() => registerClearEditor(editor, onClear), [editor, onClear]);
	return null;
}
