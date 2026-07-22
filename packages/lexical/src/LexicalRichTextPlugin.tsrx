// Ported from @lexical/react/src/LexicalRichTextPlugin.tsx. Wires the core
// rich-text commands and renders the provided contentEditable, an optional
// placeholder, and decorator nodes. (The legacy `isUsingReactExtension` branch is
// omitted — that's the @lexical/extension path handled in a later phase.)
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useLexicalEditable } from './useLexicalEditable';
import { useCanShowPlaceholder } from './shared/useCanShowPlaceholder';
import { useRichTextSetup } from './shared/useRichTextSetup';
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

export function RichTextPlugin(props: Props) @{
	const [editor] = useLexicalComposerContext();
	useRichTextSetup(editor);

	<>
		{props.contentEditable}
		<Placeholder content={props.placeholder} />
		<Decorators editor={editor} ErrorBoundary={props.ErrorBoundary} />
	</>
}
