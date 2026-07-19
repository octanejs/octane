// Ported from @lexical/react/src/LexicalContentEditable.tsx. Reads the editor from
// context and renders the editable element; an optional `placeholder` is shown
// while the editor can show one. React's `forwardRef` becomes a plain `ref` prop
// (spread through to the element).
import type { LexicalEditor } from 'lexical';
import { useLexicalComposerContext } from './LexicalComposerContext';
import { useCanShowPlaceholder } from './shared/useCanShowPlaceholder';
import { ContentEditableElement } from './shared/LexicalContentEditableElement.tsrx';
import type { ContentEditableElementProps } from './shared/LexicalContentEditableElement.tsrx';
import { useLayoutEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';

// Re-export the lower-level element (matches @lexical/react/LexicalContentEditable).
export { ContentEditableElement } from './shared/LexicalContentEditableElement.tsrx';

/**
 * Props for the {@link ContentEditable} component. These are the
 * {@link ContentEditableElementProps} (minus `editor`, which is read from
 * context) plus an optional `placeholder`; when a `placeholder` is provided an
 * `aria-placeholder` string is also required for accessibility.
 */
export type ContentEditableProps =
	Omit<ContentEditableElementProps, 'editor'> & (| {
			'aria-placeholder'?: void;
			placeholder?: null;
	  }
	| {
			'aria-placeholder': string;
			placeholder: ((isEditable: boolean) => OctaneNode) | OctaneNode;
	  });

function Placeholder(props: {
	editor: LexicalEditor;
	content: ContentEditableProps['placeholder'];
}) {
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
	let placeholder: OctaneNode = null;
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

export function ContentEditable(props: ContentEditableProps) @{
	const [editor] = useLexicalComposerContext();
	<>
		<ContentEditableElement editor={editor} {...props} />
		{props.placeholder != null ? <Placeholder editor={editor} content={props.placeholder} /> : null}
	</>
}
