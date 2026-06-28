// Ported from @lexical/react/src/LexicalContentEditable.tsx. Reads the editor from
// context and renders the editable element; an optional `placeholder` is shown
// while the editor can show one. React's `forwardRef` becomes a plain `ref` prop
// (spread through to the element).
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useCanShowPlaceholder } from './shared/useCanShowPlaceholder';
import { ContentEditableElement } from './shared/LexicalContentEditableElement.tsrx';
import { useLayoutEffect, useState } from 'octane';

// Re-export the lower-level element (matches @lexical/react/LexicalContentEditable).
export { ContentEditableElement } from './shared/LexicalContentEditableElement.tsrx';

function Placeholder(props) {
	const editor = props.editor;
	const showPlaceholder = useCanShowPlaceholder(editor);
	const [isEditable, setEditable] = useState(editor.isEditable());

	useLayoutEffect(() => {
		setEditable(editor.isEditable());
		return editor.registerEditableListener((currentIsEditable) => {
			setEditable(currentIsEditable);
		});
	}, [editor]);

	if (!showPlaceholder) {
		return null;
	}

	const content = props.content;
	let placeholder = null;
	if (typeof content === 'function') {
		placeholder = content(isEditable);
	} else if (content !== null) {
		placeholder = content;
	}
	if (placeholder === null) {
		return null;
	}
	return <div aria-hidden="true">{placeholder}</div>;
}

export function ContentEditable(props) @{
	const [editor] = useLexicalComposerContext();
	<>
		<ContentEditableElement editor={editor} {...props} />
		{props.placeholder != null ? <Placeholder editor={editor} content={props.placeholder} /> : null}
	</>
}
