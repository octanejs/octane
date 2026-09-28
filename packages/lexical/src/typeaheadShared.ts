import type { LexicalEditor, RangeSelection } from 'lexical';

import {
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	getDOMSelection,
	getDOMSelectionPoints,
} from 'lexical';

// Non-component internals of LexicalTypeaheadMenuPlugin.tsx. The public helpers
// live in LexicalTypeaheadMenuPluginUtils.ts.

export function getTextUpToAnchor(selection: RangeSelection): string | null {
	const anchor = selection.anchor;
	if (anchor.type !== 'text') {
		return null;
	}
	const anchorNode = anchor.getNode();
	if (!anchorNode.isSimpleText()) {
		return null;
	}
	const anchorOffset = anchor.offset;
	return anchorNode.getTextContent().slice(0, anchorOffset);
}

export function tryToPositionRange(
	leadOffset: number,
	range: Range,
	editorWindow: Window,
	rootElement: HTMLElement | null,
): boolean {
	const domSelection = getDOMSelection(editorWindow);
	if (domSelection === null || !domSelection.isCollapsed) {
		return false;
	}
	const points = getDOMSelectionPoints(domSelection, rootElement);
	const anchorNode = points.anchorNode;
	const startOffset = leadOffset;
	const endOffset = points.anchorOffset;
	if (anchorNode == null || endOffset == null) {
		return false;
	}
	try {
		range.setStart(anchorNode, startOffset);
		range.setEnd(anchorNode, endOffset);
	} catch (_error) {
		return false;
	}
	return true;
}

export function getQueryTextForSearch(editor: LexicalEditor): string | null {
	let text = null;
	editor.read('latest', () => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) {
			return;
		}
		text = getTextUpToAnchor(selection);
	});
	return text;
}

export function isSelectionOnEntityBoundary(editor: LexicalEditor, offset: number): boolean {
	if (offset !== 0) {
		return false;
	}
	return editor.read('latest', () => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) {
			const anchor = selection.anchor;
			const anchorNode = anchor.getNode();
			const prevSibling = anchorNode.getPreviousSibling();
			return $isTextNode(prevSibling) && prevSibling.isTextEntity();
		}
		return false;
	});
}
