// Ported from @lexical/react/src/LexicalPlainTextPlugin.tsx — the plain-text twin
// of RichTextPlugin (registerPlainText instead of registerRichText).
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useLexicalEditable } from './useLexicalEditable';
import { useCanShowPlaceholder } from './shared/useCanShowPlaceholder';
import { usePlainTextSetup } from './shared/usePlainTextSetup';
import { Decorators } from './shared/LexicalDecorators.tsrx';
import type { OctaneNode } from 'octane';

// Octane analog of @lexical/react's ErrorBoundaryType (a component taking the
// decorator subtree plus an onError callback).
type ErrorBoundaryType =
	(props: {
		children: OctaneNode;
		onError: (error: Error) => void;
	}) => OctaneNode;

type Props = {
	contentEditable: OctaneNode;
	placeholder?: ((isEditable: boolean) => OctaneNode) | null | OctaneNode;
	ErrorBoundary: ErrorBoundaryType;
};

function Placeholder(props: { content: Props['placeholder'] }) {
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

export function PlainTextPlugin(props: Props) @{
	const [editor] = useLexicalComposerContext();
	usePlainTextSetup(editor);

	<>
		{props.contentEditable}
		<Placeholder content={props.placeholder} />
		<Decorators editor={editor} ErrorBoundary={props.ErrorBoundary} />
	</>
}
