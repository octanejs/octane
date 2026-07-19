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

/**
 * Props for the {@link TablePlugin} component.
 */
export interface TablePluginProps {
	/**
 * When `false` (default `true`), merged cell support (colspan and rowspan)
 * will be disabled and all tables will be forced into a regular grid with
 * 1x1 table cells.
 */
	hasCellMerge?: boolean;
	/**
 * When `false` (default `true`), the background color of TableCellNode will
 * always be removed.
 */
	hasCellBackgroundColor?: boolean;
	/**
 * When `true` (default `true`), the tab key can be used to navigate table
 * cells.
 */
	hasTabHandler?: boolean;
	/**
 * When `true` (default `false`), tables will be wrapped in a `<div>` to
 * enable horizontal scrolling.
 */
	hasHorizontalScroll?: boolean;
	/**
 * When `true` (default `false`), nested tables will be allowed.
 *
 * @experimental Nested tables are not officially supported.
 */
	hasNestedTables?: boolean;
}

export function TablePlugin(props: TablePluginProps) {
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
