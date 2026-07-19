// Ported from @lexical/react/src/LexicalLinkPlugin.ts. namedSignals is from
// @lexical/extension's framework-agnostic core.
import { namedSignals } from '@lexical/extension';
import { LinkNode, registerLink } from '@lexical/link';
import type { LinkAttributes } from '@lexical/link';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useEffect } from 'octane';

type Props = {
	validateUrl?: (url: string) => boolean;
	attributes?: LinkAttributes;
};

export function LinkPlugin(props: Props) {
	const [editor] = useLexicalComposerContext();
	const validateUrl = props.validateUrl;
	const attributes = props.attributes;

	// Explicit every-render check (matches @lexical/react).
	useEffect(() => {
		if (!editor.hasNodes([LinkNode])) {
			throw new Error('LinkPlugin: LinkNode not registered on editor');
		}
	}, null);

	useEffect(() => registerLink(editor, namedSignals({ attributes, validateUrl })), [
		editor,
		validateUrl,
		attributes,
	]);

	return null;
}
