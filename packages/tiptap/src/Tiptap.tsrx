// Ported from @tiptap/react 3.28.0 Tiptap.tsx. Refs remain ordinary props in
// Octane, and the compound Tiptap.Content component needs no forwardRef layer.
import { createContext, useContext, useMemo } from 'octane';

import { EditorContext } from './Context';
import { EditorContent } from './EditorContent.tsrx';
import { splitSlot, subSlot } from './internal';
import { useEditorState } from './useEditorState';

export const TiptapContext = createContext({
	get editor() {
		throw new Error('useTiptap must be used within a <Tiptap> provider');
	},
});

TiptapContext.displayName = 'TiptapContext';

/** Read the editor instance provided by the nearest `Tiptap` component. */
export function useTiptap() {
	return useContext(TiptapContext);
}

/** Select a reactive slice of editor state from the context editor. */
export function useTiptapState(selector, ...args) {
	const [userArgs, slot] = splitSlot(args);
	const equalityFn = userArgs[0];
	const { editor } = useTiptap();

	// Call through a non-hook-named alias because this source is itself compiled:
	// the public call site's slot is already being forwarded explicitly here.
	const selectEditorState = useEditorState;
	return selectEditorState(
		{
			editor,
			selector,
			equalityFn,
		},
		subSlot(slot, 'tiptap:state'),
	);
}

export function TiptapWrapper({ children, ...props }) @{
	const resolvedEditor =
		'editor' in props ? props.editor : props.instance;

	if (!resolvedEditor) {
		throw new Error('Tiptap: An editor instance is required. Pass a non-null `editor` prop.');
	}

	const tiptapContextValue = useMemo(() => ({ editor: resolvedEditor }), [resolvedEditor]);
	const legacyContextValue = useMemo(() => ({ editor: resolvedEditor }), [resolvedEditor]);

	<EditorContext.Provider value={legacyContextValue}>
		<TiptapContext.Provider value={tiptapContextValue}>{children}</TiptapContext.Provider>
	</EditorContext.Provider>
}

TiptapWrapper.displayName = 'Tiptap';

/** Render EditorContent using the editor supplied by the nearest Tiptap root. */
export function TiptapContent(props) @{
	const { editor } = useTiptap();

	<EditorContent editor={editor} {...props} />
}

TiptapContent.displayName = 'Tiptap.Content';

export const Tiptap = Object.assign(TiptapWrapper, {
	Content: TiptapContent,
});

export default Tiptap
