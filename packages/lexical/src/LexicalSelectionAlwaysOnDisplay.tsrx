// Ported from @lexical/react/src/LexicalSelectionAlwaysOnDisplay.tsx.
import { selectionAlwaysOnDisplay } from '@lexical/utils';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

export function SelectionAlwaysOnDisplay(props) {
	const [editor] = useLexicalComposerContext();
	const onReposition = props.onReposition;
	useEffect(() => selectionAlwaysOnDisplay(editor, onReposition), [editor, onReposition]);
	return null;
}
