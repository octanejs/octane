// Ported from @tiptap/react 3.28.0 Context.tsx. Octane contexts intentionally
// have no `.Consumer`; the compatibility component below implements the same
// render-prop contract with useContext instead.
import type { Editor } from '@tiptap/core';
import { createContext, isChildrenBlock, useContext, useMemo, type OctaneNode } from 'octane';

import { EditorContent, type EditorContentProps } from './EditorContent.tsrx';
import { useEditor, type UseEditorOptions } from './useEditor';

/** The editor value shared by the legacy TipTap context API. */
export type EditorContextValue = {
	editor: Editor | null;
};

export const EditorContext = createContext<EditorContextValue>({
	editor: null,
});

/** Read the editor from the nearest `EditorProvider` or `Tiptap` component. */
export function useCurrentEditor(): EditorContextValue {
	return useContext(EditorContext);
}

export interface EditorConsumerProps {
	children: (value: EditorContextValue) => OctaneNode;
}

export type EditorContainerProps =
	Omit<EditorContentProps, 'editor' | 'innerRef' | 'ref'> & {
		editor?: never;
		innerRef?: never;
		ref?: never;
	};

export type EditorProviderProps =
	UseEditorOptions & {
		children?: OctaneNode;
		slotBefore?: OctaneNode;
		slotAfter?: OctaneNode;
		editorContainerProps?: EditorContainerProps;
	};

export function EditorConsumer(props: EditorConsumerProps): OctaneNode {
	const value = useCurrentEditor();
	const children = props.children;

	if (typeof children !== 'function' || isChildrenBlock(children)) {
		throw new TypeError('EditorConsumer expects a function as its only child.');
	}

	return children(value);
}

/**
 * Create an editor and expose it to descendants through the legacy context.
 */
export function EditorProvider(props: EditorProviderProps) @{
	const { children, slotAfter, slotBefore, editorContainerProps = {}, ...editorOptions } = props;
	const editor = useEditor(editorOptions);
	const contextValue = useMemo(() => ({ editor }), [editor]);

	if (!editor) {
		return null;
	}

	<EditorContext value={contextValue}>
		{slotBefore}
		<EditorConsumer>
			{({ editor: currentEditor }: EditorContextValue) =>
				<EditorContent {...editorContainerProps} editor={currentEditor} />}
		</EditorConsumer>
		{children}
		{slotAfter}
	</EditorContext>
}
