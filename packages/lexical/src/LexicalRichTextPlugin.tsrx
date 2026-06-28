// Ported from @lexical/react/src/LexicalRichTextPlugin.tsx. Wires the core
// rich-text commands and renders the provided contentEditable, an optional
// placeholder, and decorator nodes. (The legacy `isUsingReactExtension` branch is
// omitted — that's the @lexical/extension path handled in a later phase.)
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useLexicalEditable } from './useLexicalEditable';
import { useCanShowPlaceholder } from './shared/useCanShowPlaceholder';
import { useRichTextSetup } from './shared/useRichTextSetup';
import { Decorators } from './shared/LexicalDecorators.tsrx';

function Placeholder(props) {
	const [editor] = useLexicalComposerContext();
	const showPlaceholder = useCanShowPlaceholder(editor);
	const editable = useLexicalEditable();

	if (!showPlaceholder) {
		return null;
	}
	const content = props.content;
	if (typeof content === 'function') {
		return content(editable);
	}
	return content != null ? content : null;
}

export function RichTextPlugin(props) @{
	const [editor] = useLexicalComposerContext();
	useRichTextSetup(editor);

	<>
		{props.contentEditable}
		<Placeholder content={props.placeholder} />
		<Decorators editor={editor} ErrorBoundary={props.ErrorBoundary} />
	</>
}
