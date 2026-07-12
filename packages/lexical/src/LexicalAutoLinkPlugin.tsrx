// Ported from @lexical/react/src/LexicalAutoLinkPlugin.ts (useAutoLink inlined).
import invariant from '@lexical/internal/invariant';
import { AutoLinkNode, registerAutoLink } from '@lexical/link';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

export { createLinkMatcherWithRegExp } from '@lexical/link';

export function AutoLinkPlugin(props) {
	const [editor] = useLexicalComposerContext();
	const matchers = props.matchers;
	const onChange = props.onChange;
	const excludeParents = props.excludeParents;

	// Explicit every-render check (matches @lexical/react).
	useEffect(() => {
		if (!editor.hasNodes([AutoLinkNode])) {
			invariant(false, 'LexicalAutoLinkPlugin: AutoLinkNode not registered on editor');
		}
	}, null);

	useEffect(
		() => registerAutoLink(editor, {
			changeHandlers: onChange ? [onChange] : [],
			excludeParents: excludeParents ?? [],
			matchers,
		}),
		[editor, matchers, onChange, excludeParents],
	);

	return null;
}
