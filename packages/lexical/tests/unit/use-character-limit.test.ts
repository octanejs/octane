import { afterEach, assert, describe, expect, test } from 'vitest';
import { buildEditorFromExtensions } from '@lexical/extension';
import {
	$createOverflowNode,
	$isOverflowNode,
	OverflowExtension,
	type OverflowNode,
} from '@lexical/overflow';
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isParagraphNode,
	$isRangeSelection,
	$isTextNode,
	$setSlot,
	DecoratorNode,
	type ElementNode,
	type LexicalEditorWithDispose,
	type ParagraphNode,
} from 'lexical';
import { $mergePrevious, $wrapOverflowedNodes } from '@octanejs/lexical/shared/useCharacterLimit';

// Local stand-in for lexical/src/__tests__/utils' TestDecoratorNode (not shipped
// in the npm package): a decorator whose text content is 'Hello world' (11
// chars, matching upstream). Upstream's node is inline unless
// `setIsInline(false)` is called; the only caller here slots it as a non-inline
// decorator, so this stand-in is always non-inline instead.
class TestDecoratorNode extends DecoratorNode<null> {
	static getType() {
		return 'test-decorator';
	}
	static clone(node: TestDecoratorNode) {
		return new TestDecoratorNode(node.__key);
	}
	getTextContent() {
		return 'Hello world';
	}
	isInline() {
		return false;
	}
	createDOM() {
		return document.createElement('div');
	}
	updateDOM() {
		return false;
	}
	decorate() {
		return null;
	}
}

function $createTestDecoratorNode(): TestDecoratorNode {
	return new TestDecoratorNode();
}

function makeEditor(): LexicalEditorWithDispose {
	const editor = buildEditorFromExtensions({
		dependencies: [OverflowExtension],
		name: 'character-limit-test',
		nodes: [TestDecoratorNode],
	});
	editor.setRootElement(document.createElement('div'));
	return editor;
}

function $setupLeftRightOverflow(): {
	overflowLeft: OverflowNode;
	overflowRight: OverflowNode;
	paragraph: ParagraphNode;
} {
	const root = $getRoot();
	root.clear();
	const paragraph = $createParagraphNode();
	const overflowLeft = $createOverflowNode();
	const overflowRight = $createOverflowNode();
	root.append(paragraph);
	paragraph.append(overflowLeft, overflowRight);
	return { overflowLeft, overflowRight, paragraph };
}

// Ported from @lexical/react/src/__tests__/unit/useLexicalCharacterLimit.test.ts (0.51.0).
// The hook itself (mount-time count and wrapping) is covered through
// CharacterLimitPlugin in character-limit-plugin.test.ts, as upstream does.
describe('useCharacterLimit', () => {
	let editor: LexicalEditorWithDispose;

	afterEach(() => {
		editor.setRootElement(null);
		// Not upstream: release the built editor's extension registrations too.
		editor.dispose();
	});

	describe('$mergePrevious', () => {
		test('merges left overflow into right with selection in left', async () => {
			editor = makeEditor();

			await editor.update(() => {
				const { overflowLeft, overflowRight, paragraph } = $setupLeftRightOverflow();

				const text1 = $createTextNode('1');
				const text2 = $createTextNode('2');
				const text3 = $createTextNode('3');
				const text4 = $createTextNode('4');

				overflowLeft.append(text1, text2);
				text2.toggleFormat('bold');
				overflowRight.append(text3, text4);
				text4.toggleFormat('bold');

				text1.select(1, 1);

				$mergePrevious(overflowRight);

				expect(paragraph.getChildrenSize()).toBe(1);
				expect($isOverflowNode(paragraph.getFirstChild())).toBe(true);

				const selection = $getSelection();
				if (!$isRangeSelection(selection)) {
					throw new Error('Lost selection');
				}

				expect(selection.anchor.key).toBe(text1.getKey());
				expect(selection.anchor.offset).toBe(1);
				expect(selection.focus.key).toBe(text1.getKey());
				expect(selection.focus.offset).toBe(1);
			});
		});

		test('merges with selection spanning both overflows', async () => {
			editor = makeEditor();

			await editor.update(() => {
				const { overflowLeft, overflowRight, paragraph } = $setupLeftRightOverflow();

				const text1 = $createTextNode('1');
				const text2 = $createTextNode('2');
				const text3 = $createTextNode('3');
				const text4 = $createTextNode('4');

				overflowLeft.append(text1, text2);
				text2.toggleFormat('bold');
				overflowRight.append(text3, text4);
				text4.toggleFormat('bold');

				const selection = text2.select(0, 0);
				selection.focus.set(text3.getKey(), 1, 'text');

				$mergePrevious(overflowRight);

				expect(paragraph.getChildrenSize()).toBe(1);

				const updatedSelection = $getSelection();
				if (!$isRangeSelection(updatedSelection)) {
					throw new Error('Lost selection');
				}

				expect(updatedSelection.anchor.key).toBe(text2.getKey());
				expect(updatedSelection.anchor.offset).toBe(0);
				expect(updatedSelection.focus.key).toBe(text3.getKey());
				expect(updatedSelection.focus.offset).toBe(1);
			});
		});
	});

	describe('$wrapOverflowedNodes', () => {
		test('merges adjacent overflow nodes when wrapping before existing overflow', async () => {
			editor = makeEditor();

			await editor.update(() => {
				const root = $getRoot();
				root.clear();
				const paragraph = $createParagraphNode();
				const text = $createTextNode('abcde');
				const overflow = $createOverflowNode();
				overflow.append($createTextNode('f'));
				paragraph.append(text, overflow);
				root.append(paragraph);
			});

			await editor.update(() => {
				const paragraph = $getRoot().getFirstChildOrThrow<ElementNode>();
				const text = paragraph.getFirstChild();
				if ($isTextNode(text)) {
					text.setTextContent('abcdge');
				}
			});

			await editor.update(() => {
				$wrapOverflowedNodes(5);
			});

			editor.read(() => {
				const paragraph = $getRoot().getFirstChildOrThrow<ElementNode>();
				const children = paragraph.getChildren();
				expect(children.length).toBe(2);
				expect(children[0].getTextContent()).toBe('abcdg');
				expect($isOverflowNode(children[1])).toBe(true);
				expect(children[1].getTextContent()).toBe('ef');
			});
		});

		test('counts \\n\\n separators between paragraphs (#6329)', async () => {
			editor = makeEditor();

			await editor.update(() => {
				const root = $getRoot();
				root.clear();
				root.append(
					$createParagraphNode().append($createTextNode('123')),
					$createParagraphNode().append($createTextNode('456')),
				);
			});

			await editor.update(() => {
				// "123\n\n456" — offset 5 means "123" (3) + separator (2) = 5,
				// so all of P2 should be overflow.
				$wrapOverflowedNodes(5);
			});

			editor.read(() => {
				const root = $getRoot();
				const p1 = root.getChildAtIndex(0);
				const p2 = root.getChildAtIndex(1);
				assert($isParagraphNode(p1));
				assert($isParagraphNode(p2));
				expect(p1.getTextContent()).toBe('123');
				expect($isOverflowNode(p1.getFirstChild())).toBe(false);
				const overflow = p2.getFirstChild();
				assert($isOverflowNode(overflow));
				expect(overflow.getTextContent()).toBe('456');
			});
		});

		test('splits text correctly with separator budget (#6329)', async () => {
			editor = makeEditor();

			await editor.update(() => {
				const root = $getRoot();
				root.clear();
				root.append(
					$createParagraphNode().append($createTextNode('12')),
					$createParagraphNode().append($createTextNode('3456')),
				);
			});

			await editor.update(() => {
				// "12\n\n3456" — offset 5 means "12" (2) + separator (2) + "3" (1) = 5,
				// so "456" in P2 should be overflow.
				$wrapOverflowedNodes(5);
			});

			editor.read(() => {
				const root = $getRoot();
				const p2 = root.getChildAtIndex(1);
				assert($isParagraphNode(p2));
				const [kept, overflow] = p2.getChildren();
				expect(kept.getTextContent()).toBe('3');
				assert($isOverflowNode(overflow));
				expect(overflow.getTextContent()).toBe('456');
			});
		});

		test('counts multiple separators across three paragraphs (#6329)', async () => {
			editor = makeEditor();

			await editor.update(() => {
				const root = $getRoot();
				root.clear();
				root.append(
					$createParagraphNode().append($createTextNode('abc')),
					$createParagraphNode().append($createTextNode('de')),
					$createParagraphNode().append($createTextNode('fgh')),
				);
			});

			await editor.update(() => {
				// "abc\n\nde\n\nfgh" — offset 9 means "abc"(3)+sep(2)+"de"(2)+sep(2)=9,
				// so all of P3 should be overflow.
				$wrapOverflowedNodes(9);
			});

			editor.read(() => {
				const root = $getRoot();
				const p1 = root.getChildAtIndex(0);
				const p2 = root.getChildAtIndex(1);
				const p3 = root.getChildAtIndex(2);
				assert($isParagraphNode(p1));
				assert($isParagraphNode(p2));
				assert($isParagraphNode(p3));
				expect(p1.getTextContent()).toBe('abc');
				expect($isOverflowNode(p1.getFirstChild())).toBe(false);
				expect(p2.getTextContent()).toBe('de');
				expect($isOverflowNode(p2.getFirstChild())).toBe(false);
				const overflow = p3.getFirstChild();
				assert($isOverflowNode(overflow));
				expect(overflow.getTextContent()).toBe('fgh');
			});
		});

		// A text-bearing non-inline decorator slotted into a host is skipped by
		// the wrap loop (replacing it with an OverflowNode would throw), but its
		// text is part of the root text content that funds `offset` — the budget
		// must advance past it or every later wrap boundary lands late by the
		// decorator's size.
		test('advances the budget past a slotted decorator so the wrap boundary is exact', async () => {
			editor = makeEditor();

			await editor.update(() => {
				const root = $getRoot();
				root.clear();
				const host = $createParagraphNode();
				host.append($createTextNode('12345'));
				root.append(host);
				// TestDecoratorNode.getTextContent() === 'Hello world' (11 chars);
				// slots-first dfs counts it ahead of the host's text.
				$setSlot(host, 'media', $createTestDecoratorNode());
			});

			await editor.update(() => {
				// Budget: 11 (slotted decorator) + 2 ('12') = 13; '345' is over.
				$wrapOverflowedNodes(13);
			});

			editor.read(() => {
				const host = $getRoot().getFirstChildOrThrow<ElementNode>();
				const children = host.getChildren();
				expect(children[0].getTextContent()).toBe('12');
				expect($isOverflowNode(children[1])).toBe(true);
				expect(children[1].getTextContent()).toBe('345');
			});
		});
	});
});
