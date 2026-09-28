import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	$getNodeByKey,
	$getRoot,
	$getSelection,
	$isNodeSelection,
	$isRangeSelection,
	$selectAll,
	type LexicalEditor,
	type NodeKey,
} from 'lexical';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { NodeSelectionEditor } from '../_fixtures/node-selection-editor.tsrx';

type MountResult = ReturnType<typeof mount>;

// Ported from @lexical/react/src/__tests__/unit/useLexicalNodeSelection.test.tsx (0.51.0).
// All four upstream cases are ported. setSelected() schedules a non-discrete
// editor.update; editor.read() flushes pending updates first, so each read
// observes the result exactly as upstream's act() + read does.

async function settle() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
		flushEffects();
	}
}

describe('useLexicalNodeSelection', () => {
	let mounted: MountResult;
	let editor: LexicalEditor;
	let setSelected: (selected: boolean) => void;
	let ruleKey: NodeKey;

	beforeEach(async () => {
		const editorRef: { current: LexicalEditor | null } = { current: null };
		mounted = mount(NodeSelectionEditor as any, {
			editorRef,
			onRuleKey: (key: NodeKey) => {
				ruleKey = key;
			},
			onSetSelected: (fn: (selected: boolean) => void) => {
				setSelected = fn;
			},
		});
		await settle();
		editor = editorRef.current!;
		expect(editor).toBeTruthy();
		expect(ruleKey).toBeTruthy();
		expect(typeof setSelected).toBe('function');
	});

	afterEach(() => {
		mounted.unmount();
	});

	it('keeps a range selection that does not cover the node', async () => {
		// A caret in the paragraph, which does not reach the horizontal rule.
		editor.update(() => void $getRoot().getFirstChild()!.selectEnd(), { discrete: true });
		expect(editor.read(() => $getNodeByKey(ruleKey)!.isSelected())).toBe(false);

		// Deselecting a node the selection does not reach has nothing to do, so it
		// must not discard the user's caret to say so.
		setSelected(false);
		await settle();

		expect(editor.read(() => $isRangeSelection($getSelection()))).toBe(true);
	});

	it('deselects a node the range selection does cover', async () => {
		editor.update(() => void $selectAll(), { discrete: true });
		// LexicalNode.isSelected() is true for a RangeSelection that covers the
		// node, so the `clearSelection(); setSelected(!isSelected)` toggle used by
		// HorizontalRuleNode, BlockWithAlignableContents and the playground
		// decorators arrives here with `false`. Ignoring it makes those a dead
		// click: isSelected stays true, so the node can never be selected.
		expect(editor.read(() => $getNodeByKey(ruleKey)!.isSelected())).toBe(true);

		setSelected(false);
		await settle();

		expect(editor.read(() => $getNodeByKey(ruleKey)!.isSelected())).toBe(false);
	});

	it('still creates a node selection when asked to select', async () => {
		editor.update(() => void $selectAll(), { discrete: true });

		setSelected(true);
		await settle();

		expect(
			editor.read(() => {
				const selection = $getSelection();
				return $isNodeSelection(selection) && selection.has(ruleKey);
			}),
		).toBe(true);
	});

	it('still removes the node from an existing node selection', async () => {
		setSelected(true);
		await settle();
		expect(
			editor.read(() => {
				const selection = $getSelection();
				return $isNodeSelection(selection) && selection.has(ruleKey);
			}),
		).toBe(true);

		setSelected(false);
		await settle();
		expect(editor.read(() => $getNodeByKey(ruleKey)!.isSelected())).toBe(false);
	});
});
