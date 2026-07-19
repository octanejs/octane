// Ported from @lexical/react/src/LexicalListPlugin.ts (+ shared/useList.ts inlined
// as the third useEffect, matching @lexical/react which registers list twice).
import {
	ListItemNode,
	ListNode,
	registerList,
	registerListStrictIndentTransform,
} from '@lexical/list';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { mergeRegister } from 'lexical';
import { useEffect } from 'octane';

/**
 * Props for the {@link ListPlugin} component.
 */
export interface ListPluginProps {
	/**
 * When `true`, enforces strict indentation rules for list items, ensuring
 * consistent structure. When `false` (default), indentation is more flexible.
 */
	hasStrictIndent?: boolean;
	/**
 * When `true`, splitting a numbered list will preserve the numbering
 * continuity. When `false` (default), the new split list resets to 1.
 */
	shouldPreserveNumbering?: boolean;
}

export function ListPlugin(props: ListPluginProps) {
	const [editor] = useLexicalComposerContext();
	const hasStrictIndent =
		props.hasStrictIndent === undefined ? false : props.hasStrictIndent;
	const shouldPreserveNumbering =
		props.shouldPreserveNumbering === undefined ? false : props.shouldPreserveNumbering;

	useEffect(() => {
		if (!editor.hasNodes([ListNode, ListItemNode])) {
			throw new Error('ListPlugin: ListNode and/or ListItemNode not registered on editor');
		}
	}, [editor]);

	useEffect(() => {
		return mergeRegister(
			registerList(editor, { restoreNumbering: shouldPreserveNumbering }),
			hasStrictIndent ? registerListStrictIndentTransform(editor) : () => {},
		);
	}, [editor, hasStrictIndent, shouldPreserveNumbering]);

	// useList(editor) — inlined.
	useEffect(() => registerList(editor), [editor]);

	return null;
}
