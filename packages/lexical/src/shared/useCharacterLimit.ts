// Ported from @lexical/react/src/shared/useCharacterLimit.ts. The overflow-wrapping
// logic ($wrapOverflowedNodes / $mergePrevious / findOffset) is framework-agnostic
// and copied verbatim. Only the hook wrapper changes: `optional` is an OPTIONAL user
// arg, so the trailing compiler-injected slot is found with splitSlot, and each of
// the two useEffects gets a distinct sub-slot.
import type { LexicalEditor, LexicalNode } from 'lexical';

import invariant from '@lexical/internal/invariant';
import { $createOverflowNode, $isOverflowNode, OverflowNode } from '@lexical/overflow';
import { $rootTextContent } from '@lexical/text';
import { $dfsWithSlots, $unwrapNode } from '@lexical/utils';
import {
	$findMatchingParent,
	$getSelection,
	$getSlotHost,
	$isElementNode,
	$isLeafNode,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	COMMAND_PRIORITY_LOW,
	DELETE_CHARACTER_COMMAND,
	HISTORY_MERGE_TAG,
	mergeRegister,
} from 'lexical';
import { useEffect } from 'octane';

import { splitSlot, subSlot } from './internal';

type OptionalProps = {
	remainingCharacters?: (characters: number) => void;
	strlen?: (input: string) => number;
};

export function useCharacterLimit(...args: any[]): void {
	const [user, slot] = splitSlot(args);
	const editor = user[0] as LexicalEditor;
	const maxCharacters = user[1] as number;
	const optional = (user[2] as OptionalProps) ?? Object.freeze({});

	const strlen = optional.strlen ?? ((input: string) => input.length);
	const remainingCharacters =
		optional.remainingCharacters ??
		(() => {
			return;
		});

	useEffect(
		() => {
			if (!editor.hasNodes([OverflowNode])) {
				invariant(false, 'useCharacterLimit: OverflowNode not registered on editor');
			}
		},
		[editor],
		subSlot(slot, 'ucl:nodes'),
	);

	useEffect(
		() => {
			let text = editor.read('latest', $rootTextContent);
			let lastComputedTextLength = 0;

			return mergeRegister(
				editor.registerTextContentListener((currentText: string) => {
					text = currentText;
				}),
				editor.registerUpdateListener(({ dirtyLeaves, dirtyElements }) => {
					const isComposing = editor.isComposing();
					const hasContentChanges = dirtyLeaves.size > 0 || dirtyElements.size > 0;

					if (isComposing || !hasContentChanges) {
						return;
					}

					const textLength = strlen(text);
					const textLengthAboveThreshold =
						textLength > maxCharacters ||
						(lastComputedTextLength !== null && lastComputedTextLength > maxCharacters);
					const diff = maxCharacters - textLength;

					remainingCharacters(diff);

					if (lastComputedTextLength === null || textLengthAboveThreshold) {
						const offset = findOffset(text, maxCharacters, strlen);
						editor.update(
							() => {
								$wrapOverflowedNodes(offset);
							},
							{
								tag: HISTORY_MERGE_TAG,
							},
						);
					}

					lastComputedTextLength = textLength;
				}),
				editor.registerCommand(
					DELETE_CHARACTER_COMMAND,
					(isBackward) => {
						const selection = $getSelection();
						if (!$isRangeSelection(selection)) {
							return false;
						}
						const anchorNode = selection.anchor.getNode();
						const overflow = anchorNode.getParent();
						const overflowParent = overflow ? overflow.getParent() : null;
						const parentNext = overflowParent ? overflowParent.getNextSibling() : null;
						selection.deleteCharacter(isBackward);
						if (overflowParent && overflowParent.isEmpty()) {
							overflowParent.remove();
						} else if ($isElementNode(parentNext) && parentNext.isEmpty()) {
							parentNext.remove();
						}
						return true;
					},
					COMMAND_PRIORITY_LOW,
				),
			);
		},
		[editor, maxCharacters, remainingCharacters, strlen],
		subSlot(slot, 'ucl:track'),
	);
}

function findOffset(
	text: string,
	maxCharacters: number,
	strlen: (input: string) => number,
): number {
	let offsetUtf16 = 0;
	let offset = 0;

	if (typeof Intl.Segmenter === 'function') {
		const segmenter = new Intl.Segmenter();
		const graphemes = segmenter.segment(text);

		for (const { segment: grapheme } of graphemes) {
			const nextOffset = offset + strlen(grapheme);

			if (nextOffset > maxCharacters) {
				break;
			}

			offset = nextOffset;
			offsetUtf16 += grapheme.length;
		}
	} else {
		const codepoints = Array.from(text);
		const codepointsLength = codepoints.length;

		for (let i = 0; i < codepointsLength; i++) {
			const codepoint = codepoints[i];
			const nextOffset = offset + strlen(codepoint);

			if (nextOffset > maxCharacters) {
				break;
			}

			offset = nextOffset;
			offsetUtf16 += codepoint.length;
		}
	}

	return offsetUtf16;
}

export function $wrapOverflowedNodes(offset: number): void {
	const dfsNodes = $dfsWithSlots();
	const dfsNodesLength = dfsNodes.length;
	let accumulatedLength = 0;

	for (let i = 0; i < dfsNodesLength; i += 1) {
		const { node } = dfsNodes[i];

		const isSlotValueLeaf = $isLeafNode(node) && $getSlotHost(node) !== null;
		const needsOverflowParent =
			$isLeafNode(node) && !isSlotValueLeaf && !$findMatchingParent(node, $isOverflowNode);

		if ($isOverflowNode(node)) {
			const previousLength = accumulatedLength;
			const nextLength = accumulatedLength + node.getTextContentSize();

			if (nextLength <= offset) {
				const parent = node.getParent();
				const previousSibling = node.getPreviousSibling();
				const nextSibling = node.getNextSibling();
				$unwrapNode(node);
				const selection = $getSelection();

				if (
					$isRangeSelection(selection) &&
					(!selection.anchor.getNode().isAttached() || !selection.focus.getNode().isAttached())
				) {
					if ($isTextNode(previousSibling)) {
						previousSibling.select();
					} else if ($isTextNode(nextSibling)) {
						nextSibling.select();
					} else if (parent !== null) {
						parent.select();
					}
				}
			} else if (previousLength < offset) {
				const descendant = node.getFirstDescendant();
				const descendantLength = descendant !== null ? descendant.getTextContentSize() : 0;
				const previousPlusDescendantLength = previousLength + descendantLength;
				const firstDescendantIsSimpleText = $isTextNode(descendant) && descendant.isSimpleText();
				const firstDescendantDoesNotOverflow = previousPlusDescendantLength <= offset;

				if (firstDescendantIsSimpleText || firstDescendantDoesNotOverflow) {
					$unwrapNode(node);
				}
			}
		} else if (isSlotValueLeaf) {
			accumulatedLength += node.getTextContentSize();
		} else if (needsOverflowParent) {
			const previousAccumulatedLength = accumulatedLength;
			accumulatedLength += node.getTextContentSize();

			if (accumulatedLength > offset && !$isOverflowNode(node.getParent())) {
				const previousSelection = $getSelection();
				let overflowNode;

				if (previousAccumulatedLength < offset && $isTextNode(node) && node.isSimpleText()) {
					const [, overflowedText] = node.splitText(offset - previousAccumulatedLength);
					overflowNode = $wrapNode(overflowedText);
				} else {
					overflowNode = $wrapNode(node);
				}

				if (previousSelection !== null) {
					$setSelection(previousSelection);
				}

				$mergePrevious(overflowNode);
			}
		}
	}
}

function $wrapNode(node: LexicalNode): OverflowNode {
	const overflowNode = $createOverflowNode();
	node.replace(overflowNode);
	overflowNode.append(node);
	return overflowNode;
}

export function $mergePrevious(overflowNode: OverflowNode): void {
	const previousNode = overflowNode.getPreviousSibling();

	if (!$isOverflowNode(previousNode)) {
		return;
	}

	const firstChild = overflowNode.getFirstChild();
	const previousNodeChildren = previousNode.getChildren();
	const previousNodeChildrenLength = previousNodeChildren.length;

	if (firstChild === null) {
		overflowNode.append(...previousNodeChildren);
	} else {
		for (let i = 0; i < previousNodeChildrenLength; i++) {
			firstChild.insertBefore(previousNodeChildren[i]);
		}
	}

	const selection = $getSelection();

	if ($isRangeSelection(selection)) {
		const anchor = selection.anchor;
		const anchorNode = anchor.getNode();
		const focus = selection.focus;
		const focusNode = anchor.getNode();

		if (anchorNode.is(previousNode)) {
			anchor.set(overflowNode.getKey(), anchor.offset, 'element');
		} else if (anchorNode.is(overflowNode)) {
			anchor.set(overflowNode.getKey(), previousNodeChildrenLength + anchor.offset, 'element');
		}

		if (focusNode.is(previousNode)) {
			focus.set(overflowNode.getKey(), focus.offset, 'element');
		} else if (focusNode.is(overflowNode)) {
			focus.set(overflowNode.getKey(), previousNodeChildrenLength + focus.offset, 'element');
		}
	}

	previousNode.remove();
}
