// DOM lifecycle bridge ported from @tiptap/react 3.28.0 EditorContent.tsx.
// Portal-backed node and mark views intentionally arrive in the next stage;
// this component owns only adoption, reset, editor switching, and host refs.
import { memo, useLayoutEffect, useMemo, useRef } from 'octane';

export function PureEditorContent(props) @{
	const { editor, innerRef, ref, ...rest } = props;
	const editorContentRef = useRef(null);

	useLayoutEffect(() => {
		if (!editor || editor.isDestroyed || editor.isEditorContentInitialized) {
			return;
		}

		const element = editorContentRef.current;
		const editorParent = editor.view.dom?.parentNode;

		if (!element || !editorParent) {
			return;
		}

		// The core Editor initially mounts into its own detached element. Move the
		// complete ProseMirror-owned subtree into Octane's committed host element;
		// moving nodes preserves the existing EditorView and DOM identity.
		element.append(...editorParent.childNodes);
		editor.setOptions({ element });
		editor.createNodeViews();
		editor.isEditorContentInitialized = true;

		return () => {
			editor.isEditorContentInitialized = false;

			if (!editor.isDestroyed) {
				editor.view.setProps({ nodeViews: {} });
			}

			// Reset the editor to a detached element so the still-live instance can
			// safely be mounted by a later EditorContent. A view that has already
			// been destroyed or never mounted has nothing left to transfer.
			try {
				const currentParent = editor.view.dom?.parentNode;

				if (!currentParent) {
					return;
				}

				const detachedElement = document.createElement('div');
				detachedElement.append(...currentParent.childNodes);
				editor.setOptions({ element: detachedElement });
			} catch {
				// The editor may have been destroyed before this layout cleanup.
			}
		};
	}, [editor]);

	<div {...rest} ref={[ref, innerRef, editorContentRef]} />
}

function EditorContentWithKey(props) @{
	// Remount the host whenever the Editor identity changes, matching the keyed
	// wrapper in @tiptap/react and preventing one editor from retaining another
	// editor's managed DOM.
	const key = useMemo(() => Math.floor(Math.random() * 4294967295).toString(), [props.editor]);

	<PureEditorContent key={key} {...props} />
}

export const EditorContent = memo(EditorContentWithKey);
