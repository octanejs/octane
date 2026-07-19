// Ported from @lexical/react/src/LexicalAutoFocusPlugin.ts.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { getActiveElement } from 'lexical';
import { useEffect } from 'octane';

type Props = {
	defaultSelection?: 'rootStart' | 'rootEnd';
};

export function AutoFocusPlugin(props: Props) {
	const [editor] = useLexicalComposerContext();
	const defaultSelection = props.defaultSelection;

	useEffect(() => {
		editor.focus(() => {
			const rootElement = editor.getRootElement();
			// getActiveElement rather than document.activeElement (shadow-root safe).
			const activeElement =
				rootElement !== null ? getActiveElement(rootElement) : null;
			if (
				rootElement !== null && (activeElement === null || !rootElement.contains(activeElement))
			) {
				rootElement.focus({ preventScroll: true });
			}
		}, { defaultSelection });
	}, [defaultSelection, editor]);

	return null;
}
