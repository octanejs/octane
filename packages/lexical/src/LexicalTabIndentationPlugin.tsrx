// Ported from @lexical/react/src/LexicalTabIndentationPlugin.tsx.
// registerTabIndentation is from @lexical/extension's framework-agnostic core.
import { registerTabIndentation } from '@lexical/extension';
import type { CanIndentPredicate } from '@lexical/extension';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

export { registerTabIndentation } from '@lexical/extension';

type Props = {
	maxIndent?: number;
	/**
 * By default, indents are set on all elements for which
 * {@link ElementNode.canIndent} returns true. This option allows you to set
 * indents for specific nodes without overriding the method for others.
 */
	$canIndent?: CanIndentPredicate;
};

export function TabIndentationPlugin(props: Props) {
	const [editor] = useLexicalComposerContext();
	const maxIndent = props.maxIndent;
	const canIndent = props.$canIndent;

	useEffect(() => registerTabIndentation(editor, maxIndent, canIndent), [
		editor,
		maxIndent,
		canIndent,
	]);

	return null;
}
