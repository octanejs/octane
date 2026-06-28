import { ContentEditableElement } from '@octanejs/lexical/LexicalContentEditable';

// Renders ContentEditableElement with a manually-created editor + arbitrary props,
// for porting @lexical/react's LexicalContentEditableElement.test.tsx.
export function CeeProbe(props) @{
	<ContentEditableElement editor={props.editor} {...props.ceProps} />
}
