// Ported from @lexical/react/src/LexicalMarkdownShortcutPlugin.tsx. The HR
// transformer + node come from @lexical/extension's agnostic core.
import {
	$createHorizontalRuleNode,
	$isHorizontalRuleNode,
	HorizontalRuleNode,
} from '@lexical/extension';
import type { ElementTransformer, Transformer } from '@lexical/markdown';
import { registerMarkdownShortcuts, TRANSFORMERS } from '@lexical/markdown';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

const HR: ElementTransformer = {
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

export const DEFAULT_TRANSFORMERS: Transformer[] = [HR, ...TRANSFORMERS];

type Props =
	Readonly<{
		transformers?: Transformer[];
	}>;

export function MarkdownShortcutPlugin(props: Props) {
	const [editor] = useLexicalComposerContext();
	const transformers =
		props.transformers === undefined ? DEFAULT_TRANSFORMERS : props.transformers;

	useEffect(() => registerMarkdownShortcuts(editor, transformers), [editor, transformers]);

	return null;
}
