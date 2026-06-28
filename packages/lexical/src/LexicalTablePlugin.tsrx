// Ported from @lexical/react/src/LexicalTablePlugin.ts (usePropSignal inlined).
import { signal } from '@lexical/extension';
import {
	$isScrollableTablesActive,
	registerTableCellUnmergeTransform,
	registerTablePlugin,
	registerTableSelectionObserver,
	setScrollableTablesActive,
	TableCellNode,
} from '@lexical/table';
import { $fullReconcile } from 'lexical';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect, useState } from 'octane';

export function TablePlugin(props) {
	const [editor] = useLexicalComposerContext();
	const hasCellMerge =
		props.hasCellMerge === undefined ? true : props.hasCellMerge;
	const hasCellBackgroundColor =
		props.hasCellBackgroundColor === undefined ? true : props.hasCellBackgroundColor;
	const hasTabHandler =
		props.hasTabHandler === undefined ? true : props.hasTabHandler;
	const hasHorizontalScroll =
		props.hasHorizontalScroll === undefined ? false : props.hasHorizontalScroll;
	const hasNestedTables =
		props.hasNestedTables === undefined ? false : props.hasNestedTables;

	useEffect(() => {
		const hadHorizontalScroll = $isScrollableTablesActive(editor);
		if (hadHorizontalScroll !== hasHorizontalScroll) {
			setScrollableTablesActive(editor, hasHorizontalScroll);
			editor.update($fullReconcile);
		}
	}, [editor, hasHorizontalScroll]);

	// usePropSignal — inlined.
	const [hasNestedTablesSignal] = useState(() => signal(hasNestedTables));
	if (hasNestedTablesSignal.peek() !== hasNestedTables) {
		hasNestedTablesSignal.value = hasNestedTables;
	}

	useEffect(() => registerTablePlugin(editor, { hasNestedTables: hasNestedTablesSignal }), [
		editor,
		hasNestedTablesSignal,
	]);

	useEffect(() => registerTableSelectionObserver(editor, hasTabHandler), [editor, hasTabHandler]);

	useEffect(() => {
		if (!hasCellMerge) {
			return registerTableCellUnmergeTransform(editor);
		}
	}, [editor, hasCellMerge]);

	useEffect(() => {
		if (hasCellBackgroundColor) {
			return;
		}
		return editor.registerNodeTransform(TableCellNode, (node) => {
			if (node.getBackgroundColor() !== null) {
				node.setBackgroundColor(null);
			}
		});
	}, [editor, hasCellBackgroundColor, hasCellMerge]);

	return null;
}
