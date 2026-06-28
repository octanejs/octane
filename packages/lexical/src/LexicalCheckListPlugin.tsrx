// Ported from @lexical/react/src/LexicalCheckListPlugin.tsx.
import { registerCheckList } from '@lexical/list';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

export function CheckListPlugin(props) {
	const [editor] = useLexicalComposerContext();
	const disableTakeFocusOnClick =
		props.disableTakeFocusOnClick === undefined ? false : props.disableTakeFocusOnClick;

	useEffect(() => registerCheckList(editor, { disableTakeFocusOnClick }), [
		editor,
		disableTakeFocusOnClick,
	]);
	return null;
}
