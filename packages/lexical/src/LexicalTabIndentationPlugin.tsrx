// Ported from @lexical/react/src/LexicalTabIndentationPlugin.tsx.
// registerTabIndentation is from @lexical/extension's framework-agnostic core.
import { registerTabIndentation } from '@lexical/extension';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

export { registerTabIndentation } from '@lexical/extension';

export function TabIndentationPlugin(props) {
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
