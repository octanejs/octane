// Ported from @lexical/react/src/LexicalOnChangePlugin.ts.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { HISTORY_MERGE_TAG } from 'lexical';
import { useLayoutEffect } from 'octane';

export function OnChangePlugin(props) {
	const [editor] = useLexicalComposerContext();
	const ignoreHistoryMergeTagChange =
		props.ignoreHistoryMergeTagChange === undefined ? true : props.ignoreHistoryMergeTagChange;
	const ignoreSelectionChange =
		props.ignoreSelectionChange === undefined ? false : props.ignoreSelectionChange;
	const onChange = props.onChange;

	useLayoutEffect(() => {
		if (onChange) {
			return editor.registerUpdateListener(({
				editorState,
				dirtyElements,
				dirtyLeaves,
				prevEditorState,
				tags,
			}) => {
				if (
					ignoreSelectionChange && dirtyElements.size === 0 && dirtyLeaves.size === 0 ||
						ignoreHistoryMergeTagChange && tags.has(HISTORY_MERGE_TAG) ||
						prevEditorState.isEmpty()
				) {
					return;
				}
				onChange(editorState, editor, tags);
			});
		}
	}, [editor, ignoreHistoryMergeTagChange, ignoreSelectionChange, onChange]);

	return null;
}
