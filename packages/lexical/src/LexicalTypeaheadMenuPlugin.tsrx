// Ported from @lexical/react/src/LexicalTypeaheadMenuPlugin.tsx — renders a
// floating menu (mentions / slash-command) while the text before the cursor
// matches `triggerFn`. `.tsrx` component (auto-slotted hooks); uses octane's
// startTransition (the React version used a reactPatches shim).
import { useLexicalComposerContext } from './LexicalComposerContext';
import { LexicalMenu } from './shared/LexicalMenu.tsrx';
import { useMenuAnchorRef } from './shared/useMenuAnchorRef';
import {
	getQueryTextForSearch,
	isSelectionOnEntityBoundary,
	tryToPositionRange,
} from './typeaheadShared';
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical';
import { startTransition, useCallback, useEffect, useState } from 'octane';

export { useBasicTypeaheadTriggerMatch, PUNCTUATION } from './typeaheadShared';
export { MenuOption, SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND } from './shared/menuShared';
export { useDynamicPositioning } from './shared/useDynamicPositioning';
// Upstream re-exports @lexical/utils' getScrollParent from this module.
export { getScrollParent } from '@lexical/utils';

export function LexicalTypeaheadMenuPlugin(props) {
	const options = props.options;
	const onQueryChange = props.onQueryChange;
	const onSelectOption = props.onSelectOption;
	const onOpen = props.onOpen;
	const onClose = props.onClose;
	const menuRenderFn = props.menuRenderFn;
	const triggerFn = props.triggerFn;
	const anchorClassName = props.anchorClassName;
	const commandPriority =
		props.commandPriority != null ? props.commandPriority : COMMAND_PRIORITY_LOW;
	const parent = props.parent;
	const preselectFirstItem = props.preselectFirstItem !== false;
	const ignoreEntityBoundary = props.ignoreEntityBoundary === true;

	const [editor] = useLexicalComposerContext();
	const [resolution, setResolution] = useState(null);
	const anchorElementRef = useMenuAnchorRef(resolution, setResolution, anchorClassName, parent);

	const closeTypeahead = useCallback(() => {
		if (resolution === null) {
			return;
		}
		const finish = () => setResolution(null);
		let result;
		try {
			result = onClose && onClose();
		} finally {
			if (result) {
				result.then(finish, finish);
			} else {
				finish();
			}
		}
	}, [onClose, resolution]);

	const openTypeahead = useCallback((res) => {
		setResolution(res);
		if (onOpen != null && resolution === null) {
			onOpen(res);
		}
	}, [onOpen, resolution]);

	useEffect(() => {
		const updateListener = () => {
			editor.read('latest', () => {
				if (!editor.isEditable()) {
					closeTypeahead();
					return;
				}
				if (editor.isComposing()) {
					return;
				}
				const editorWindow = editor._window || window;
				const range = editorWindow.document.createRange();
				const selection = $getSelection();
				const text = getQueryTextForSearch(editor);
				if (
					!$isRangeSelection(selection) || !selection.isCollapsed() || text === null ||
						range === null
				) {
					closeTypeahead();
					return;
				}
				const match = triggerFn(text, editor);
				onQueryChange(match ? match.matchingString : null);
				if (
					match !== null &&
						(ignoreEntityBoundary || !isSelectionOnEntityBoundary(editor, match.leadOffset))
				) {
					const isRangePositioned = tryToPositionRange(
						match.leadOffset,
						range,
						editorWindow,
						editor.getRootElement(),
					);
					if (isRangePositioned !== null) {
						startTransition(
							() => openTypeahead({ getRect: () => range.getBoundingClientRect(), match }),
						);
						return;
					}
				}
				closeTypeahead();
			});
		};
		return editor.registerUpdateListener(updateListener);
	}, [
		editor,
		triggerFn,
		onQueryChange,
		resolution,
		closeTypeahead,
		openTypeahead,
		ignoreEntityBoundary,
	]);

	useEffect(
		() => editor.registerEditableListener((isEditable) => {
			if (!isEditable) {
				closeTypeahead();
			}
		}),
		[editor, closeTypeahead],
	);

	if (resolution === null || editor === null || anchorElementRef.current === null) {
		return null;
	}
	return <LexicalMenu
		close={closeTypeahead}
		resolution={resolution}
		editor={editor}
		anchorElementRef={anchorElementRef}
		options={options}
		menuRenderFn={menuRenderFn}
		shouldSplitNodeWithQuery={true}
		onSelectOption={onSelectOption}
		commandPriority={commandPriority}
		preselectFirstItem={preselectFirstItem}
	/>;
}
