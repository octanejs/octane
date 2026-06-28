import { describe, it, expect } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { $rootTextContent } from '@lexical/text';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { HashtagNode } from '@lexical/hashtag';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { OverflowNode } from '@lexical/overflow';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { ConfigEditor } from '../_fixtures/config-editor.tsrx';

// Ported from @lexical/react/src/__tests__/unit/PlainRichTextPlugin.test.tsx —
// adapted to octane's mount/act harness. Covers binding behaviors: the two
// initialEditorState shapes and placeholder visibility vs. the editable flag.
const RICH_TEXT_NODES = [
	HeadingNode,
	ListNode,
	ListItemNode,
	QuoteNode,
	TableNode,
	TableCellNode,
	TableRowNode,
	HashtagNode,
	AutoLinkNode,
	LinkNode,
	OverflowNode,
];

const INITIAL_STATE_JSON =
	'{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"foo","type":"text","version":1}],"direction":"ltr","format":"","indent":0,"type":"paragraph","version":1}],"direction":"ltr","format":"","indent":0,"type":"root","version":1}}';

describe('PlainRichTextPlugin (ported from @lexical/react)', () => {
	for (const plugin of ['plain', 'rich'] as const) {
		const nodes = plugin === 'plain' ? [] : RICH_TEXT_NODES;

		it(`${plugin}: custom initialEditorState (updater function)`, () => {
			let editor: any;
			const editorState = () => {
				$getRoot().append($createParagraphNode().append($createTextNode('foo')));
			};
			const r = mount(ConfigEditor as any, {
				plugin,
				nodes,
				editorState,
				onEditor: (ed: any) => (editor = ed),
			});
			flushEffects();
			expect(editor.read('latest', $rootTextContent)).toBe('foo');
			r.unmount();
		});

		it(`${plugin}: custom initialEditorState (JSON string)`, () => {
			let editor: any;
			const r = mount(ConfigEditor as any, {
				plugin,
				nodes,
				editorState: INITIAL_STATE_JSON,
				onEditor: (ed: any) => (editor = ed),
			});
			flushEffects();
			expect(editor.read('latest', $rootTextContent)).toBe('foo');
			r.unmount();
		});

		it(`${plugin}: can hide placeholder when non-editable`, async () => {
			let editor: any;
			const r = mount(ConfigEditor as any, {
				plugin,
				nodes,
				withPlaceholder: true,
				onEditor: (ed: any) => (editor = ed),
			});
			flushEffects();
			expect(r.findAll('.placeholder').length).toBe(1);
			expect(r.find('.placeholder').textContent).toBe('My placeholder');

			editor.setEditable(false);
			// Placeholder re-renders from the editable listener (octane re-render).
			flushEffects();
			await nextPaint();
			flushEffects();
			expect(r.findAll('.placeholder').length).toBe(0);
			r.unmount();
		});
	}
});
