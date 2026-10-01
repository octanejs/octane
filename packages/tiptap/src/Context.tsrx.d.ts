import type { Editor } from '@tiptap/core';
import type { Context, OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

import type { EditorContentProps } from './EditorContent.tsrx';
import type { UseEditorOptions } from './useEditor';

/** The editor value shared by the legacy TipTap context API. */
export type EditorContextValue = {
	editor: Editor | null;
};

export declare const EditorContext: Context<EditorContextValue>;

/** Read the editor from the nearest `EditorProvider` or `Tiptap` component. */
export declare function useCurrentEditor(): EditorContextValue;

export interface EditorConsumerProps {
	children: (value: EditorContextValue) => OctaneNode;
}

export type EditorContainerProps = Omit<EditorContentProps, 'editor' | 'innerRef' | 'ref'> & {
	editor?: never;
	innerRef?: never;
	ref?: never;
};

export type EditorProviderProps = UseEditorOptions & {
	children?: OctaneNode;
	slotBefore?: OctaneNode;
	slotAfter?: OctaneNode;
	editorContainerProps?: EditorContainerProps;
};

export declare function EditorConsumer(props: EditorConsumerProps): OctaneNode;
export declare function EditorProvider(props: EditorProviderProps): Octane.JSX.Element | null;
