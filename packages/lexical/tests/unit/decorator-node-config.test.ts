import { describe, it, expect } from 'vitest';
import {
	$cloneWithProperties,
	$create,
	$getNodeByKey,
	$getRoot,
	$parseSerializedNode,
	createEditor,
	type LexicalEditor,
	type NodeKey,
} from 'lexical';
import {
	DecoratorBlockNode,
	$isDecoratorBlockNode,
} from '@octanejs/lexical/LexicalDecoratorBlockNode';
import {
	$createHorizontalRuleNode,
	$isHorizontalRuleNode,
	HorizontalRuleNode,
} from '@octanejs/lexical/LexicalHorizontalRuleNode';

// Covers the 0.51.0 port of @lexical/react's LexicalDecoratorBlockNode.ts and
// LexicalHorizontalRuleNode.tsx to Lexical's `$config` protocol (DecoratorBlockNode
// now serializes through src/shared/LexicalReactGeneratedJSON.ts). Upstream
// @lexical/react 0.51.0 ships no unit test for either node, so these are
// Octane-authored; they pin the serialized shapes the generated JSON produces.

class TestBlockNode extends DecoratorBlockNode {
	$config() {
		return this.config('test-decorator-block', { extends: DecoratorBlockNode });
	}
	decorate() {
		return null;
	}
}

function makeEditor(nodes: ReadonlyArray<any>): LexicalEditor {
	return createEditor({
		namespace: 'decorator-node-config',
		nodes,
		onError: (error) => {
			throw error;
		},
	});
}

describe('DecoratorBlockNode ($config + generated JSON)', () => {
	it('exports format in full JSON and omits an empty format in compact JSON', () => {
		const editor = makeEditor([TestBlockNode]);
		editor.update(
			() => {
				const plain = $create(TestBlockNode);
				expect(plain.getFormat()).toBe('');
				expect(plain.exportJSON()).toEqual({
					format: '',
					type: 'test-decorator-block',
					version: 1,
				});
				expect(plain.exportJSON(true)).toEqual({ type: 'test-decorator-block' });

				const centered = $create(TestBlockNode).setFormat('center');
				expect(centered.exportJSON()).toEqual({
					format: 'center',
					type: 'test-decorator-block',
					version: 1,
				});
				expect(centered.exportJSON(true)).toEqual({
					format: 'center',
					type: 'test-decorator-block',
				});
			},
			{ discrete: true },
		);
	});

	it('imports format from JSON (full and compact) and drops unknown values', () => {
		const editor = makeEditor([TestBlockNode]);
		editor.update(
			() => {
				const right = $parseSerializedNode({
					format: 'right',
					type: 'test-decorator-block',
					version: 1,
				} as any);
				expect(right).toBeInstanceOf(TestBlockNode);
				expect($isDecoratorBlockNode(right)).toBe(true);
				expect((right as TestBlockNode).getFormat()).toBe('right');

				const compact = $parseSerializedNode({ type: 'test-decorator-block' } as any);
				expect((compact as TestBlockNode).getFormat()).toBe('');

				const bogus = $parseSerializedNode({
					format: 'diagonal',
					type: 'test-decorator-block',
					version: 1,
				} as any);
				expect((bogus as TestBlockNode).getFormat()).toBe('');
			},
			{ discrete: true },
		);
	});

	it('round-trips format through the serialized editor state', () => {
		const editor = makeEditor([TestBlockNode]);
		editor.update(
			() => {
				$getRoot()
					.clear()
					.append($create(TestBlockNode).setFormat('justify'), $create(TestBlockNode));
			},
			{ discrete: true },
		);
		const json = JSON.stringify(editor.getEditorState().toJSON());

		const other = makeEditor([TestBlockNode]);
		other.setEditorState(other.parseEditorState(json));
		const formats = other.read(() =>
			$getRoot()
				.getChildren()
				.map((child) => {
					expect(child).toBeInstanceOf(TestBlockNode);
					return (child as TestBlockNode).getFormat();
				}),
		);
		expect(formats).toEqual(['justify', '']);
		expect(JSON.stringify(other.getEditorState().toJSON())).toBe(json);
	});

	it('preserves __format when a node is cloned', () => {
		const editor = makeEditor([TestBlockNode]);
		let key!: NodeKey;
		editor.update(
			() => {
				const node = $create(TestBlockNode).setFormat('end');
				key = node.getKey();
				$getRoot().clear().append(node);
			},
			{ discrete: true },
		);
		editor.update(
			() => {
				const committed = $getNodeByKey(key) as TestBlockNode;
				// getWritable() clones the frozen committed node via afterCloneFrom.
				const writable = committed.getWritable();
				expect(writable).not.toBe(committed);
				expect(writable.__format).toBe('end');

				const copy = $cloneWithProperties(committed);
				expect(copy).toBeInstanceOf(TestBlockNode);
				expect(copy.__format).toBe('end');
			},
			{ discrete: true },
		);
	});
});

describe('HorizontalRuleNode ($config)', () => {
	it("keeps the 'horizontalrule' type", () => {
		const editor = makeEditor([HorizontalRuleNode]);
		expect(HorizontalRuleNode.getType()).toBe('horizontalrule');
		editor.update(
			() => {
				const node = $createHorizontalRuleNode();
				expect(node).toBeInstanceOf(HorizontalRuleNode);
				expect(node.getType()).toBe('horizontalrule');
				expect($isHorizontalRuleNode(node)).toBe(true);
			},
			{ discrete: true },
		);
	});

	it('imports <hr> as the Octane HorizontalRuleNode via importDOM', () => {
		const editor = makeEditor([HorizontalRuleNode]);
		const hr = document.createElement('hr');
		editor.update(
			() => {
				const conversions = HorizontalRuleNode.importDOM!();
				expect(conversions).not.toBeNull();
				const factory = conversions!.hr;
				expect(typeof factory).toBe('function');
				const conversion = factory!(hr);
				expect(conversion).not.toBeNull();
				expect(conversion!.priority).toBe(0);
				const output = conversion!.conversion(hr);
				expect(output!.node).toBeInstanceOf(HorizontalRuleNode);
			},
			{ discrete: true },
		);
	});

	it('round-trips through JSON as the Octane subclass', () => {
		const editor = makeEditor([HorizontalRuleNode]);
		editor.update(
			() => {
				$getRoot().clear().append($createHorizontalRuleNode());
			},
			{ discrete: true },
		);
		const serialized = editor.getEditorState().toJSON();
		const child = (serialized.root.children as any[])[0];
		expect(child).toEqual({ type: 'horizontalrule', version: 1 });

		const other = makeEditor([HorizontalRuleNode]);
		other.setEditorState(other.parseEditorState(JSON.stringify(serialized)));
		other.read(() => {
			const children = $getRoot().getChildren();
			expect(children).toHaveLength(1);
			expect(children[0]).toBeInstanceOf(HorizontalRuleNode);
			expect(children[0].exportJSON()).toEqual({ type: 'horizontalrule', version: 1 });
		});
	});
});
