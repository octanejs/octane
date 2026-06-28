import type { LexicalEditor, RangeSelection } from 'lexical';
import type { MenuTextMatch, TriggerFn } from './shared/menuShared';

import {
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	getDOMSelection,
	getDOMSelectionPoints,
} from 'lexical';
import { useCallback } from 'octane';

// Non-component helpers + the trigger hook from LexicalTypeaheadMenuPlugin.tsx.

export const PUNCTUATION = '\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%\'"~=<>_:;';

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

// Two required user args (trigger, options), so the trailing slot is positional.
export function useBasicTypeaheadTriggerMatch(
	trigger: string,
	options: {
		minLength?: number;
		maxLength?: number;
		punctuation?: string;
		allowWhitespace?: boolean;
	},
	slot?: symbol,
): TriggerFn {
	const minLength = options.minLength ?? 1;
	const maxLength = options.maxLength ?? 75;
	const punctuation = options.punctuation ?? PUNCTUATION;
	const allowWhitespace = options.allowWhitespace ?? false;
	return useCallback(
		(text: string) => {
			const validCharsSuffix = allowWhitespace ? '' : '\\s';
			const validChars = '[^' + trigger + punctuation + validCharsSuffix + ']';
			const TypeaheadTriggerRegex = new RegExp(
				'(^|\\s|\\()(' +
					'[' +
					trigger +
					']' +
					'((?:' +
					validChars +
					'){0,' +
					maxLength +
					'})' +
					')$',
			);
			const match = TypeaheadTriggerRegex.exec(text);
			if (match !== null) {
				const maybeLeadingWhitespace = match[1];
				const matchingString = match[3];
				if (matchingString.length >= minLength) {
					return {
						leadOffset: match.index + maybeLeadingWhitespace.length,
						matchingString,
						replaceableString: match[2],
					};
				}
			}
			return null;
		},
		[allowWhitespace, trigger, punctuation, maxLength, minLength],
		slot,
	);
}
