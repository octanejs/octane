import type { EditorContentProps } from './EditorContent.tsrx';
import type { EditorContextValue } from './Context';
import type { UseEditorOptions } from './useEditor';

export interface EditorConsumerProps {
	children: (value: EditorContextValue) => unknown;
}

export type EditorContainerProps = Omit<EditorContentProps, 'editor' | 'innerRef' | 'ref'> & {
	editor?: never;
	innerRef?: never;
	ref?: never;
};

export type EditorProviderProps = UseEditorOptions & {
	children?: unknown;
	slotBefore?: unknown;
	slotAfter?: unknown;
	editorContainerProps?: EditorContainerProps;
};

export declare function EditorConsumer(props: EditorConsumerProps): unknown;
export declare function EditorProvider(props: EditorProviderProps): unknown;
