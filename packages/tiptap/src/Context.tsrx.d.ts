import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

import type { EditorContentProps } from './EditorContent.tsrx';
import type { EditorContextValue } from './Context';
import type { UseEditorOptions } from './useEditor';

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
