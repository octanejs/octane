import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { EditorRefPlugin } from '@octanejs/lexical/LexicalEditorRefPlugin';
import {
	$createHorizontalRuleNode,
	HorizontalRuleNode,
} from '@octanejs/lexical/LexicalHorizontalRuleNode';
import { useLexicalNodeSelection } from '@octanejs/lexical/useLexicalNodeSelection';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { useCallback, useEffect, useState } from 'octane';

// Hands the hook's setSelected to the test (the upstream Probe assigns it to a
// test-scoped variable during render).
function Probe(props) {
	const [, setSelected] = useLexicalNodeSelection(props.nodeKey);
	props.onSetSelected(setSelected);
	return null;
}

// Seeds `hello` + a horizontal rule once the editor exists, then reports the
// rule's key.
function Seed(props) {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		let key = '';
		editor.update(() => {
			const rule = $createHorizontalRuleNode();
			$getRoot().clear().append($createParagraphNode().append($createTextNode('hello')), rule);
			key = rule.getKey();
		}, { discrete: true });
		props.onSeeded(key);
	}, [editor]);
	return null;
}

// The upstream Harness: Probe mounts only after Seed has produced the rule key.
export function NodeSelectionEditor(props) @{
	const [key, setKey] = useState(null);
	const onSeeded = useCallback((seeded) => {
		props.onRuleKey(seeded);
		setKey(seeded);
	}, []);

	<LexicalComposer
		initialConfig={{
			namespace: 'node-selection',
			nodes: [HorizontalRuleNode],
			onError: (error) => {
				throw error;
			},
		}}
	>
		<EditorRefPlugin editorRef={props.editorRef} />
		<RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
		<Seed onSeeded={onSeeded} />
		{key !== null ? <Probe nodeKey={key} onSetSelected={props.onSetSelected} /> : null}
	</LexicalComposer>
}
