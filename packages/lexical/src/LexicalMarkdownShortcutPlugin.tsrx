// Ported from @lexical/react/src/LexicalMarkdownShortcutPlugin.tsx. The HR
// transformer + node come from @lexical/extension's agnostic core.
import {
	$createHorizontalRuleNode,
	$isHorizontalRuleNode,
	HorizontalRuleNode,
} from '@lexical/extension';
import { registerMarkdownShortcuts, TRANSFORMERS } from '@lexical/markdown';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

const HR = {
	dependencies: [HorizontalRuleNode],
	export: (node) => ($isHorizontalRuleNode(node) ? '***' : null),
	regExp: /^(---|\*\*\*|___)\s?$/,
	replace: (parentNode, _1, _2, isImport) => {
		const line = $createHorizontalRuleNode();
		if (isImport || parentNode.getNextSibling() != null) {
			parentNode.replace(line);
		} else {
			parentNode.insertBefore(line);
		}
		line.selectNext();
	},
	triggerOnEnter: true,
	type: 'element',
};

export const DEFAULT_TRANSFORMERS = [HR, ...TRANSFORMERS];

export function MarkdownShortcutPlugin(props) {
	const [editor] = useLexicalComposerContext();
	const transformers =
		props.transformers === undefined ? DEFAULT_TRANSFORMERS : props.transformers;

	useEffect(() => registerMarkdownShortcuts(editor, transformers), [editor, transformers]);

	return null;
}
